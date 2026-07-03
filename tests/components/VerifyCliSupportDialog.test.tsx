import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { SITE_TYPES } from "~/constants/siteType"
import { buildServiceCredentialRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const {
  mockFetchAccountTokens,
  mockFetchDisplayAccountRuntimeKeys,
  mockFetchApiCredentialModelIds,
  mockResolveDisplayAccountRuntimeKeySecret,
  mockResolveDisplayAccountTokenForSecret,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
} = vi.hoisted(() => ({
  mockFetchAccountTokens: vi.fn(),
  mockFetchDisplayAccountRuntimeKeys: vi.fn(),
  mockFetchApiCredentialModelIds: vi.fn(),
  mockResolveDisplayAccountRuntimeKeySecret: vi.fn(),
  mockResolveDisplayAccountTokenForSecret: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
}))

function getCliToolCardTestId(toolId: string) {
  return `verify-cli-${toolId}`
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    const runtimeKeyHelpers = await vi.importActual<
      typeof import("~/services/accounts/accountRuntimeKeys")
    >("~/services/accounts/accountRuntimeKeys")

    return {
      ...actual,
      createDisplayAccountApiContext: (account: any) => ({
        keyManagement: {
          fetchTokens: (...args: any[]) => mockFetchAccountTokens(...args),
          createToken: vi.fn(),
          resolveTokenKey: vi.fn(),
          deleteToken: vi.fn(),
          fetchUserGroups: vi.fn(),
          fetchAvailableModels: vi.fn(),
        },
        request: {
          baseUrl: account.baseUrl,
          accountId: account.id,
          auth: {
            authType: account.authType,
            userId: account.userId,
            accessToken: account.token,
            cookie: account.cookieAuthSessionCookie,
          },
        },
      }),
      requireDisplayAccountKeyManagement: (
        _account: unknown,
        keyManagement: unknown,
      ) => keyManagement,
      fetchDisplayAccountRuntimeKeys: async (...args: any[]) => {
        const runtimeKeys = await mockFetchDisplayAccountRuntimeKeys(...args)
        if (runtimeKeys !== undefined) return runtimeKeys
        const [account] = args
        const tokens = await mockFetchAccountTokens(...args)
        return tokens.map((token: any) =>
          runtimeKeyHelpers.buildDisplayAccountTokenRuntimeKey(account, token),
        )
      },
      resolveDisplayAccountRuntimeKeySecret: async (...args: any[]) => {
        const resolvedRuntimeKey =
          await mockResolveDisplayAccountRuntimeKeySecret(...args)
        if (resolvedRuntimeKey !== undefined) return resolvedRuntimeKey

        const [_account, runtimeKey] = args as [
          unknown,
          AccountRuntimeKey,
          unknown,
        ]
        if (!runtimeKeyHelpers.isAccountTokenRuntimeKey(runtimeKey)) {
          return runtimeKey
        }

        const resolvedToken = await mockResolveDisplayAccountTokenForSecret(
          args[0],
          runtimeKey.token,
          args[2],
        )
        return runtimeKeyHelpers.formatAccountRuntimeKeySecretForSite({
          ...runtimeKey,
          token: resolvedToken,
          secret: resolvedToken.key,
        })
      },
      resolveDisplayAccountTokenForSecret: (...args: any[]) =>
        mockResolveDisplayAccountTokenForSecret(...args),
    }
  },
)

vi.mock("~/services/productAnalytics/actions", () => ({
  resolveProductAnalyticsErrorCategoryFromError: (error: unknown) =>
    error &&
    typeof error === "object" &&
    (error as { statusCode?: unknown }).statusCode === 401
      ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
      : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
  startProductAnalyticsAction: (...args: any[]) =>
    mockStartProductAnalyticsAction(...args),
}))

vi.mock("~/services/apiCredentialProfiles/modelCatalog", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/apiCredentialProfiles/modelCatalog")
  >("~/services/apiCredentialProfiles/modelCatalog")

  return {
    ...actual,
    fetchApiCredentialModelIds: (...args: any[]) =>
      mockFetchApiCredentialModelIds(...args),
  }
})

const mockRunCliSupportTool = vi.fn()

vi.mock("~/services/verification/cliSupportVerification", () => ({
  CLI_TOOL_IDS: ["claude", "codex", "gemini"],
  runCliSupportTool: (...args: any[]) => mockRunCliSupportTool(...args),
}))

describe("VerifyCliSupportDialog", () => {
  beforeEach(() => {
    mockFetchAccountTokens.mockReset()
    mockFetchDisplayAccountRuntimeKeys.mockReset()
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue(undefined)
    mockFetchApiCredentialModelIds.mockReset()
    mockFetchApiCredentialModelIds.mockResolvedValue([])
    mockResolveDisplayAccountRuntimeKeySecret.mockReset()
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(undefined)
    mockResolveDisplayAccountTokenForSecret.mockReset()
    mockResolveDisplayAccountTokenForSecret.mockImplementation(
      async (_account, token) => token,
    )
    mockRunCliSupportTool.mockReset()
    mockStartProductAnalyticsAction.mockReset()
    mockCompleteProductAnalyticsAction.mockReset()
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
  })

  it("runs CLI support directly from a stored profile without loading account tokens", async () => {
    mockRunCliSupportTool.mockResolvedValueOnce({
      id: "claude",
      probeId: "tool-calling",
      status: "pass",
      latencyMs: 12,
      summary: "Supported",
      summaryKey: "verifyDialog.summaries.supported",
      input: { foo: 1 },
      output: { bar: 2 },
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockRunCliSupportTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: "claude",
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          modelId: "gpt-test",
        }),
      )
    })

    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
  })

  it("keeps account-mode tools disabled when the account is unavailable", async () => {
    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={null as any}
        initialModelId="gpt-test"
      />,
    )

    expect(
      await screen.findByText("cliSupportVerification:verifyDialog.idleHint"),
    ).toBeInTheDocument()

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    expect(runButton).toBeDisabled()
    fireEvent.click(runButton)
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(mockRunCliSupportTool).not.toHaveBeenCalled()
  })

  it("clears stale account runtime-key labels while loading another account", async () => {
    const firstAccount = {
      id: "a1",
      name: "First Account",
      username: "u1",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      health: { status: "healthy" as any },
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://first.example.invalid",
      token: "t1",
      userId: "1",
      authType: "access_token" as any,
      checkIn: { enableDetection: false } as any,
      tagIds: [],
    }
    const secondAccount = {
      ...firstAccount,
      id: "a2",
      name: "Second Account",
      baseUrl: "https://second.example.invalid",
      token: "t2",
    }
    const firstRuntimeKey = buildServiceCredentialRuntimeKey(firstAccount, {
      kind: "singleton_service_key",
      service: "codex",
      label: "First runtime key",
      key: "first-secret",
      isAuthenticated: true,
      baseUrl: "https://first-runtime.example.invalid",
    })
    const pendingSecondRuntimeKeys = createDeferred<AccountRuntimeKey[]>()

    mockFetchDisplayAccountRuntimeKeys
      .mockResolvedValueOnce([firstRuntimeKey])
      .mockReturnValueOnce(pendingSecondRuntimeKeys.promise)

    const { rerender } = render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={firstAccount}
        initialModelId="gpt-test"
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveTextContent(
        "First runtime key",
      )
    })

    rerender(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={secondAccount}
        initialModelId="gpt-test"
      />,
    )

    await waitFor(() =>
      expect(mockFetchDisplayAccountRuntimeKeys).toHaveBeenCalledTimes(2),
    )
    expect(screen.getByRole("combobox")).not.toHaveTextContent(
      "First runtime key",
    )

    await act(async () => {
      pendingSecondRuntimeKeys.resolve([])
      await pendingSecondRuntimeKeys.promise
    })
  })

  it("fetches profile models and lets the user choose one", async () => {
    mockFetchApiCredentialModelIds.mockResolvedValueOnce([
      "gpt-4o-mini",
      "o3-mini",
    ])

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId=""
      />,
    )

    await waitFor(() => {
      expect(mockFetchApiCredentialModelIds).toHaveBeenCalledWith(
        expect.objectContaining({
          apiType: "openai-compatible",
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          abortSignal: expect.any(AbortSignal),
        }),
      )
    })

    const modelPicker = screen.getByRole("combobox", {
      name: "cliSupportVerification:verifyDialog.meta.model",
    })
    fireEvent.click(modelPicker)
    fireEvent.click(await screen.findByRole("option", { name: "gpt-4o-mini" }))

    expect(modelPicker).toHaveTextContent("gpt-4o-mini")
  })

  it("aborts an in-flight profile model fetch when the dialog closes", async () => {
    let receivedSignal: AbortSignal | undefined
    mockFetchApiCredentialModelIds.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise<string[]>((resolve) => {
          abortSignal?.addEventListener(
            "abort",
            () => resolve(["late-model"]),
            { once: true },
          )
        })
      },
    )

    const { rerender } = render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId=""
      />,
    )

    await waitFor(() => expect(receivedSignal).toBeDefined())

    await act(async () => {
      rerender(
        <VerifyCliSupportDialog
          isOpen={false}
          onClose={() => {}}
          profile={{
            id: "p1",
            name: "Profile",
            apiType: "openai-compatible" as any,
            baseUrl: "https://example.com",
            apiKey: "profile-secret",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          }}
          initialModelId=""
        />,
      )
    })

    expect(receivedSignal?.aborted).toBe(true)
  })

  it("ignores aborted profile model-fetch rejections when the dialog closes", async () => {
    let receivedSignal: AbortSignal | undefined
    mockFetchApiCredentialModelIds.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise<string[]>((_resolve, reject) => {
          abortSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        })
      },
    )

    const { rerender } = render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId=""
      />,
    )

    await waitFor(() => expect(receivedSignal).toBeDefined())

    await act(async () => {
      rerender(
        <VerifyCliSupportDialog
          isOpen={false}
          onClose={() => {}}
          profile={{
            id: "p1",
            name: "Profile",
            apiType: "openai-compatible" as any,
            baseUrl: "https://example.com",
            apiKey: "profile-secret",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          }}
          initialModelId=""
        />,
      )
    })

    expect(receivedSignal?.aborted).toBe(true)
    expect(
      screen.queryByText(
        "cliSupportVerification:verifyDialog.modelsFetchFailed",
      ),
    ).not.toBeInTheDocument()
  })

  it("renders tool items and a single model input before running", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    expect(
      await screen.findAllByPlaceholderText(
        "cliSupportVerification:verifyDialog.meta.modelPlaceholder",
      ),
    ).toHaveLength(1)

    expect(
      await screen.findByText(
        "cliSupportVerification:verifyDialog.tools.claude",
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "cliSupportVerification:verifyDialog.tools.codex",
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "cliSupportVerification:verifyDialog.tools.gemini",
      ),
    ).toBeInTheDocument()
  })

  it("does not load account tokens until the dialog is opened", async () => {
    render(
      <VerifyCliSupportDialog
        isOpen={false}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
  })

  it("runs and retries a single tool and shows collapsible input/output", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    mockRunCliSupportTool.mockResolvedValueOnce({
      id: "claude",
      probeId: "tool-calling",
      status: "pass",
      latencyMs: 12,
      summary: "Supported",
      summaryKey: "verifyDialog.summaries.supported",
      input: { foo: 1 },
      output: { bar: 2 },
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockRunCliSupportTool).toHaveBeenCalledTimes(1)
      expect(mockRunCliSupportTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: "claude",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-test",
        }),
      )
    })

    expect(
      await within(toolCard).findByText(
        "cliSupportVerification:verifyDialog.summaries.supported",
      ),
    ).toBeInTheDocument()

    expect(
      within(toolCard).getByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.retry",
      }),
    ).toBeInTheDocument()

    const inputToggle = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.details.input",
    })
    fireEvent.click(inputToggle)
    expect(await within(toolCard).findByText(/"foo": 1/)).toBeInTheDocument()

    const outputToggle = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.details.output",
    })
    fireEvent.click(outputToggle)
    expect(await within(toolCard).findByText(/"bar": 2/)).toBeInTheDocument()
  })

  it("renders raw summaries and only the available details sections", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunCliSupportTool.mockResolvedValueOnce({
      id: "gemini",
      probeId: "tool-calling",
      status: "pass",
      latencyMs: 4,
      summary: "Custom summary",
      input: { modelId: "gpt-test" },
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("gemini"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    expect(
      await within(toolCard).findByText("Custom summary"),
    ).toBeInTheDocument()
    expect(
      within(toolCard).getByRole("button", {
        name: "cliSupportVerification:verifyDialog.details.input",
      }),
    ).toBeInTheDocument()
    expect(
      within(toolCard).queryByRole("button", {
        name: "cliSupportVerification:verifyDialog.details.output",
      }),
    ).not.toBeInTheDocument()
  })

  it("disables tool runs when no model id is available", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId=""
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("codex"))
    expect(
      await within(toolCard).findByText(
        "cliSupportVerification:verifyDialog.requiresModelId",
      ),
    ).toBeInTheDocument()

    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    expect(runButton).toBeDisabled()
  })

  it("uses the first available token and its model hint when no enabled token exists", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 7,
        user_id: 1,
        key: "disabled-secret",
        status: 0,
        name: "disabled-token",
        models: "claude-3-5-sonnet",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunCliSupportTool.mockResolvedValueOnce({
      id: "codex",
      probeId: "tool-calling",
      status: "pass",
      latencyMs: 8,
      summary: "Supported",
      input: { modelId: "claude-3-5-sonnet" },
      output: { ok: true },
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId=""
      />,
    )

    expect(
      await screen.findByText("cliSupportVerification:verifyDialog.modelHint"),
    ).toBeInTheDocument()

    const toolCard = await screen.findByTestId(getCliToolCardTestId("codex"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockRunCliSupportTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: "codex",
          baseUrl: "https://example.com",
          apiKey: "sk-disabled-secret",
          modelId: "claude-3-5-sonnet",
        }),
      )
    })
  })

  it("hides the token-derived model hint when an explicit model id is provided", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 9,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        models: "claude-3-5-sonnet",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-explicit"
      />,
    )

    await screen.findByTestId(getCliToolCardTestId("claude"))
    expect(
      screen.queryByText("cliSupportVerification:verifyDialog.modelHint"),
    ).not.toBeInTheDocument()
  })

  it("runs account-mode verification with a fully redacted token after resolving the secret", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockResolveDisplayAccountTokenForSecret.mockResolvedValueOnce({
      id: 1,
      user_id: 1,
      key: "resolved-secret",
      status: 1,
      name: "token-1",
      models: "",
      model_limits: "",
      created_time: 0,
      accessed_time: 0,
      expired_time: 0,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    })
    mockRunCliSupportTool.mockResolvedValueOnce({
      id: "claude",
      probeId: "tool-calling",
      status: "pass",
      latencyMs: 12,
      summary: "Supported",
      summaryKey: "verifyDialog.summaries.supported",
      input: { foo: 1 },
      output: { bar: 2 },
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockResolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledTimes(1)
      expect(mockResolveDisplayAccountTokenForSecret).toHaveBeenCalledTimes(1)
      expect(mockRunCliSupportTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: "claude",
          baseUrl: "https://example.com",
          apiKey: "sk-resolved-secret",
          modelId: "gpt-test",
        }),
      )
    })
  })

  it("runs account-mode verification with a service-credential runtime key", async () => {
    const account = {
      id: "a1",
      name: "Account",
      username: "u",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      health: { status: "healthy" as any },
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://example.invalid",
      token: "t",
      userId: "1",
      authType: "access_token" as any,
      checkIn: { enableDetection: false } as any,
      tagIds: [],
    }
    const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "service-secret",
        isAuthenticated: true,
        baseUrl: "https://runtime.example.invalid",
      },
    )
    const resolvedRuntimeKey = {
      ...serviceCredentialRuntimeKey,
      secret: "resolved-service-secret",
      credential: {
        ...serviceCredentialRuntimeKey.credential,
        key: "resolved-service-secret",
      },
    }

    mockFetchDisplayAccountRuntimeKeys.mockResolvedValueOnce([
      serviceCredentialRuntimeKey,
    ])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValueOnce(
      resolvedRuntimeKey,
    )
    mockRunCliSupportTool.mockResolvedValueOnce({
      id: "claude",
      probeId: "tool-calling",
      status: "pass",
      latencyMs: 12,
      summary: "Supported",
      summaryKey: "verifyDialog.summaries.supported",
      input: { foo: 1 },
      output: { bar: 2 },
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={account}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockResolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledWith(
        account,
        serviceCredentialRuntimeKey,
        { abortSignal: expect.any(AbortSignal) },
      )
      expect(mockRunCliSupportTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: "claude",
          baseUrl: "https://runtime.example.invalid",
          apiKey: "resolved-service-secret",
          modelId: "gpt-test",
        }),
      )
    })
    expect(mockResolveDisplayAccountTokenForSecret).not.toHaveBeenCalled()
  })

  it("clears single-tool running state when a resolved runtime key has no API key", async () => {
    const account = {
      id: "a1",
      name: "Account",
      username: "u",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      health: { status: "healthy" as any },
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://example.invalid",
      token: "t",
      userId: "1",
      authType: "access_token" as any,
      checkIn: { enableDetection: false } as any,
      tagIds: [],
    }
    const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "stale-service-secret",
        isAuthenticated: true,
        baseUrl: "https://runtime.example.invalid",
      },
    )

    mockFetchDisplayAccountRuntimeKeys.mockResolvedValueOnce([
      serviceCredentialRuntimeKey,
    ])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValueOnce({
      ...serviceCredentialRuntimeKey,
      secret: "",
      credential: {
        ...serviceCredentialRuntimeKey.credential,
        key: "",
        isAuthenticated: false,
      },
      status: "inactive",
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={account}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    expect(
      await within(toolCard).findByText(
        "cliSupportVerification:verifyDialog.summaries.noRuntimeKeySecret",
      ),
    ).toBeInTheDocument()
    expect(
      within(toolCard).getByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.retry",
      }),
    ).toBeEnabled()
    expect(mockRunCliSupportTool).not.toHaveBeenCalled()
  })

  it("keeps account-mode actions disabled for inactive empty service credentials", async () => {
    const account = {
      id: "a1",
      name: "Account",
      username: "u",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      health: { status: "healthy" as any },
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://example.invalid",
      token: "t",
      userId: "1",
      authType: "access_token" as any,
      checkIn: { enableDetection: false } as any,
      tagIds: [],
    }
    const emptyServiceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "",
        isAuthenticated: false,
        baseUrl: "https://runtime.example.invalid",
      },
    )

    mockFetchDisplayAccountRuntimeKeys.mockResolvedValueOnce([
      emptyServiceCredentialRuntimeKey,
    ])

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={account}
        initialModelId="gpt-test"
      />,
    )

    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled())
    fireEvent.click(screen.getByRole("combobox"))
    expect(
      await screen.findByRole("option", { name: "Codex" }),
    ).toHaveAttribute("aria-disabled", "true")

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeDisabled())
    fireEvent.click(runButton)

    expect(mockResolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
    expect(mockRunCliSupportTool).not.toHaveBeenCalled()
  })

  it("stops account-mode verification while resolving the full token key", async () => {
    let receivedSignal: AbortSignal | undefined
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockResolveDisplayAccountTokenForSecret.mockImplementationOnce(
      (_account, _token, options?: { abortSignal?: AbortSignal }) => {
        receivedSignal = options?.abortSignal
        if (!receivedSignal) {
          return Promise.reject(new Error("missing abort signal"))
        }

        return new Promise((resolve) => {
          receivedSignal?.addEventListener(
            "abort",
            () =>
              resolve({
                id: 1,
                user_id: 1,
                key: "resolved-secret",
                status: 1,
                name: "token-1",
                models: "",
                model_limits: "",
                created_time: 0,
                accessed_time: 0,
                expired_time: 0,
                remain_quota: 0,
                unlimited_quota: true,
                used_quota: 0,
              }),
            { once: true },
          )
        })
      },
    )

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockResolveDisplayAccountTokenForSecret).toHaveBeenCalledTimes(1),
    )

    const stopButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.stopTool",
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    await waitFor(() => {
      expect(
        within(toolCard).getByRole("button", {
          name: "cliSupportVerification:verifyDialog.actions.retry",
        }),
      ).toBeInTheDocument()
    })
    expect(mockRunCliSupportTool).not.toHaveBeenCalled()
  })

  it("marks a single CLI tool stopped when its request rejects after cancellation", async () => {
    let receivedSignal: AbortSignal | undefined
    mockRunCliSupportTool.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise((_resolve, reject) => {
          abortSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        })
      },
    )

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    const stopButton = await within(toolCard).findByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.stopTool",
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    expect(
      await within(toolCard).findByText(
        "cliSupportVerification:verifyDialog.summaries.stopped",
      ),
    ).toBeInTheDocument()
    expect(
      within(toolCard).getByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.retry",
      }),
    ).toBeInTheDocument()
  })

  it("shows the profile model fetch error when loading stored profile models fails", async () => {
    mockFetchApiCredentialModelIds.mockRejectedValueOnce(
      new Error("model catalog unavailable"),
    )

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId=""
      />,
    )

    expect(
      await screen.findByText("model catalog unavailable"),
    ).toBeInTheDocument()
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
  })

  it("falls back to the generic profile model error when the fetch error has no message", async () => {
    mockFetchApiCredentialModelIds.mockRejectedValueOnce(new Error(""))

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId=""
      />,
    )

    expect(
      await screen.findByText(
        "cliSupportVerification:verifyDialog.modelsFetchFailed",
      ),
    ).toBeInTheDocument()
  })

  it("keeps account-mode actions disabled when token loading fails", async () => {
    mockFetchAccountTokens.mockRejectedValueOnce(new Error("token list failed"))

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const runAllButton = await screen.findByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.run",
    })
    expect(runAllButton).toBeDisabled()

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    expect(
      within(toolCard).getByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.runOne",
      }),
    ).toBeDisabled()
  })

  it("keeps account-mode actions disabled when the account has no tokens", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([])

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const runAllButton = await screen.findByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.run",
    })
    expect(runAllButton).toBeDisabled()
  })

  it("surfaces HTTP failure summaries and retry state when a tool run throws", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunCliSupportTool.mockRejectedValueOnce({
      statusCode: 401,
      message: "Unauthorized",
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    expect(
      await within(toolCard).findByText(
        "cliSupportVerification:verifyDialog.summaries.unauthorized",
      ),
    ).toBeInTheDocument()
    expect(
      within(toolCard).getByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.retry",
      }),
    ).toBeInTheDocument()

    const outputToggle = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.details.output",
    })
    fireEvent.click(outputToggle)
    expect(await within(toolCard).findByText(/401/)).toBeInTheDocument()
  })

  it("does not use message-derived HTTP status for CLI failure analytics", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunCliSupportTool.mockRejectedValueOnce(new Error("Unauthorized 401"))

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const runButton = await screen.findByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.run",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    const toolCard = await screen.findByTestId(getCliToolCardTestId("claude"))
    expect(
      await within(toolCard).findByText(
        "cliSupportVerification:verifyDialog.summaries.unauthorized",
      ),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            successCount: 0,
            failureCount: 1,
          },
        },
      )
    })
  })

  it("surfaces generic unexpected failures when no HTTP status can be inferred", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunCliSupportTool.mockRejectedValueOnce(new Error("socket closed"))

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId(getCliToolCardTestId("codex"))
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    expect(
      await within(toolCard).findByText(
        "cliSupportVerification:verifyDialog.summaries.unexpectedError",
      ),
    ).toBeInTheDocument()
  })

  it("runs all CLI tools sequentially from a stored profile", async () => {
    mockRunCliSupportTool.mockImplementation(async ({ toolId }) => ({
      id: toolId,
      probeId: "tool-calling",
      status: "pass",
      latencyMs: 5,
      summary: "Supported",
      summaryKey: "verifyDialog.summaries.supported",
      input: { toolId },
      output: { ok: true },
    }))

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="gpt-test"
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() => {
      expect(
        mockRunCliSupportTool.mock.calls.map((call) => call[0].toolId),
      ).toEqual(["claude", "codex", "gemini"])
    })
  })

  it("stops a running CLI support simulation and aborts the active request", async () => {
    let receivedSignal: AbortSignal | undefined
    mockRunCliSupportTool.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise((resolve) => {
          abortSignal?.addEventListener(
            "abort",
            () =>
              resolve({
                id: "claude",
                probeId: "tool-calling",
                status: "fail",
                latencyMs: 1,
                summary: "Stopped late",
              }),
            { once: true },
          )
        })
      },
    )

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="gpt-test"
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.run",
      }),
    )

    const stopButton = await screen.findByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.stop",
    })
    await waitFor(() => {
      expect(receivedSignal).toBeDefined()
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    await waitFor(() => {
      expect(mockRunCliSupportTool).toHaveBeenCalledTimes(1)
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            successCount: 0,
            failureCount: 0,
          },
        },
      )
    })

    expect(
      await screen.findAllByText(
        "cliSupportVerification:verifyDialog.summaries.stopped",
      ),
    ).toHaveLength(3)
  })

  it("completes run-all analytics as success when all CLI tools pass", async () => {
    mockRunCliSupportTool.mockImplementation(async ({ toolId }) => ({
      id: toolId,
      probeId: "tool-calling",
      status: "pass",
      latencyMs: 5,
      summary: "Supported",
      summaryKey: "verifyDialog.summaries.supported",
    }))

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="gpt-test"
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            successCount: 3,
            failureCount: 0,
          },
        },
      )
    })
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelCliSupport,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("completes run-all analytics as failure when a CLI tool fails", async () => {
    mockRunCliSupportTool
      .mockResolvedValueOnce({
        id: "claude",
        probeId: "tool-calling",
        status: "pass",
        latencyMs: 5,
        summary: "Supported",
      })
      .mockResolvedValueOnce({
        id: "codex",
        probeId: "tool-calling",
        status: "fail",
        latencyMs: 5,
        summary: "Unsupported",
      })
      .mockResolvedValueOnce({
        id: "gemini",
        probeId: "tool-calling",
        status: "pass",
        latencyMs: 5,
        summary: "Supported",
      })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p1",
          name: "Profile",
          apiType: "openai-compatible" as any,
          baseUrl: "https://example.com",
          apiKey: "profile-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="gpt-test"
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "cliSupportVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            successCount: 2,
            failureCount: 1,
          },
        },
      )
    })
  })

  it("completes run-all analytics as skipped when no CLI tools execute", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockResolveDisplayAccountTokenForSecret.mockResolvedValue({
      id: 1,
      user_id: 1,
      key: "",
      status: 1,
      name: "token-1",
      models: "",
      model_limits: "",
      created_time: 0,
      accessed_time: 0,
      expired_time: 0,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    })

    render(
      <VerifyCliSupportDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const runAllButton = await screen.findByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.run",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          insights: {
            successCount: 0,
            failureCount: 0,
          },
        },
      )
    })
    expect(mockRunCliSupportTool).not.toHaveBeenCalled()
  })
})
