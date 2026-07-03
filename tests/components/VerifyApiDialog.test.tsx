import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyApiDialog } from "~/components/dialogs/VerifyApiDialog"
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
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createAccountModelVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import { requireHistoryTarget } from "~~/tests/test-utils/history"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const {
  mockFetchAccountTokens,
  mockFetchDisplayAccountRuntimeKeys,
  mockResolveDisplayAccountRuntimeKeySecret,
  mockResolveTokenKey,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
} = vi.hoisted(() => ({
  mockFetchAccountTokens: vi.fn(),
  mockFetchDisplayAccountRuntimeKeys: vi.fn(),
  mockResolveDisplayAccountRuntimeKeySecret: vi.fn(),
  mockResolveTokenKey: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: () => ({
    account: {
      keyManagement: {
        fetchTokens: (...args: any[]) => mockFetchAccountTokens(...args),
        createToken: vi.fn(),
        resolveTokenKey: (...args: any[]) => mockResolveTokenKey(...args),
        deleteToken: vi.fn(),
        fetchUserGroups: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
    },
  }),
}))

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

    const toRuntimeKeys = async (account: any) => {
      const runtimeKeys = await mockFetchDisplayAccountRuntimeKeys(account)
      if (runtimeKeys !== undefined) return runtimeKeys

      const tokens = await mockFetchAccountTokens(account)
      return tokens.map((token: any) =>
        runtimeKeyHelpers.buildDisplayAccountTokenRuntimeKey(account, token),
      )
    }

    return {
      ...actual,
      fetchDisplayAccountRuntimeKeys: (...args: any[]) =>
        toRuntimeKeys(args[0]),
      resolveDisplayAccountRuntimeKeySecret: async (...args: any[]) => {
        const resolvedRuntimeKey =
          await mockResolveDisplayAccountRuntimeKeySecret(...args)
        if (resolvedRuntimeKey !== undefined) return resolvedRuntimeKey

        const [account, runtimeKey, options] = args as [
          any,
          AccountRuntimeKey,
          { abortSignal?: AbortSignal } | undefined,
        ]
        if (runtimeKeyHelpers.isAccountTokenRuntimeKey(runtimeKey)) {
          const resolvedKey = await mockResolveTokenKey({
            request: {
              baseUrl: account.baseUrl,
              accountId: account.id,
              abortSignal: options?.abortSignal,
            },
            token: runtimeKey.token,
          })
          return runtimeKeyHelpers.formatAccountRuntimeKeySecretForSite({
            ...runtimeKey,
            token: { ...runtimeKey.token, key: resolvedKey },
            secret: resolvedKey,
          })
        }

        return runtimeKey
      },
      resolveDisplayAccountTokenForSecret: async (...args: any[]) => {
        const [account, token, options] = args
        const resolvedKey = await mockResolveTokenKey({
          request: {
            baseUrl: account.baseUrl,
            accountId: account.id,
            abortSignal: options?.abortSignal,
          },
          token,
        })
        return runtimeKeyHelpers.accountRuntimeKeyToLegacyApiToken(
          runtimeKeyHelpers.formatAccountRuntimeKeySecretForSite(
            runtimeKeyHelpers.buildAccountTokenRuntimeKey(
              runtimeKeyHelpers.buildAccountRuntimeKeyAccount(account),
              { ...token, key: resolvedKey },
            ),
          ),
        )
      },
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

const mockRunApiVerificationProbe = vi.fn()
const mockGetApiVerificationProbeDefinitions = vi.fn()

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...original,
    getApiVerificationProbeDefinitions: (
      apiType: Parameters<
        typeof original.getApiVerificationProbeDefinitions
      >[0],
    ) =>
      mockGetApiVerificationProbeDefinitions(apiType) ??
      original.getApiVerificationProbeDefinitions(apiType),
    runApiVerificationProbe: (...args: any[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

describe("VerifyApiDialog", () => {
  beforeEach(async () => {
    // Prevent cross-test leakage from `mockResolvedValueOnce` and call counts.
    mockFetchAccountTokens.mockReset()
    mockFetchDisplayAccountRuntimeKeys.mockReset()
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue(undefined)
    mockResolveDisplayAccountRuntimeKeySecret.mockReset()
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(undefined)
    mockResolveTokenKey.mockReset()
    mockResolveTokenKey.mockImplementation(
      async ({ token }: { token: { key: string } }) => token.key,
    )
    mockRunApiVerificationProbe.mockReset()
    mockGetApiVerificationProbeDefinitions.mockReset()
    mockStartProductAnalyticsAction.mockReset()
    mockCompleteProductAnalyticsAction.mockReset()
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    await verificationResultHistoryStorage.clearAllData()
  })

  it("renders probe items before running", async () => {
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

    render(
      <VerifyApiDialog
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
      await screen.findByText(
        "aiApiVerification:verifyDialog.probes.text-generation",
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.probes.tool-calling",
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.probes.structured-output",
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.probes.web-search",
      ),
    ).toBeInTheDocument()
  })

  it("runs and retries a single probe and shows collapsible input/output", async () => {
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

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
      input: { foo: 1 },
      output: { bar: 2 },
    })

    render(
      <VerifyApiDialog
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

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    // The action button is disabled until runtime keys are fetched and selected.
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
    )

    expect(
      await within(probeCard).findByText("Text generation succeeded"),
    ).toBeInTheDocument()

    expect(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.retry",
      }),
    ).toBeInTheDocument()

    const inputToggle = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.details.input",
    })
    fireEvent.click(inputToggle)
    expect(await within(probeCard).findByText(/"foo": 1/)).toBeInTheDocument()

    const outputToggle = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.details.output",
    })
    fireEvent.click(outputToggle)
    expect(await within(probeCard).findByText(/"bar": 2/)).toBeInTheDocument()
  })

  it("defaults to a token compatible with the requested model group", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "default-secret",
        status: 1,
        name: "default-token",
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 2,
        user_id: 1,
        key: "vip-secret",
        status: 1,
        name: "vip-token",
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
    })

    render(
      <VerifyApiDialog
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
        modelEnableGroups={["vip"]}
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-vip-secret",
          tokenMeta: expect.objectContaining({
            id: 2,
            name: "vip-token",
          }),
        }),
      ),
    )
  })

  it("uses enabled tokens without group filtering when model group context is omitted", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "default-secret",
        status: 1,
        name: "default-token",
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
    })

    render(
      <VerifyApiDialog
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

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-default-secret",
          tokenMeta: expect.objectContaining({
            id: 1,
            name: "default-token",
          }),
        }),
      ),
    )
  })

  it("keeps probes disabled when runtime-key loading fails", async () => {
    mockFetchDisplayAccountRuntimeKeys.mockRejectedValueOnce(
      new Error("inventory offline"),
    )

    render(
      <VerifyApiDialog
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

    await waitFor(() =>
      expect(mockFetchDisplayAccountRuntimeKeys).toHaveBeenCalledTimes(1),
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    expect(runButton).toBeDisabled()
    fireEvent.click(runButton)
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("verifies service-credential runtime keys without token conversion", async () => {
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

    mockFetchDisplayAccountRuntimeKeys.mockResolvedValueOnce([
      serviceCredentialRuntimeKey,
    ])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValueOnce({
      ...serviceCredentialRuntimeKey,
      secret: "resolved-service-secret",
      credential: {
        ...serviceCredentialRuntimeKey.credential,
        key: "resolved-service-secret",
      },
    })
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
    })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={account}
        initialModelId="gpt-test"
        modelEnableGroups={["vip"]}
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockResolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledWith(
        account,
        serviceCredentialRuntimeKey,
        { abortSignal: expect.any(AbortSignal) },
      )
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://runtime.example.invalid",
          apiKey: "resolved-service-secret",
          tokenMeta: undefined,
        }),
      )
    })
    expect(mockResolveTokenKey).not.toHaveBeenCalled()
  })

  it("does not fall back to selecting empty service-credential runtime keys", async () => {
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
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={account}
        initialModelId="gpt-test"
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeDisabled())
    fireEvent.click(runButton)

    expect(mockResolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("does not fall back to an incompatible enabled token for a requested model group", async () => {
    const onManageModelKey = vi.fn()
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "default-secret",
        status: 1,
        name: "default-token",
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyApiDialog
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
        modelEnableGroups={["vip"]}
        onManageModelKey={onManageModelKey}
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1))
    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.noCompatibleRuntimeKeyHint",
      ),
    ).toBeInTheDocument()
    const manageButton = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.manageModelKey",
    })
    fireEvent.click(manageButton)
    expect(onManageModelKey).toHaveBeenCalledTimes(1)
    expect(runButton).toBeDisabled()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("blocks verification when the selected token becomes incompatible with the model group", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "default-secret",
        status: 1,
        name: "default-token",
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 2,
        user_id: 1,
        key: "vip-secret",
        status: 1,
        name: "vip-token",
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyApiDialog
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
        modelEnableGroups={["vip"]}
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1))
    fireEvent.change(
      screen.getByPlaceholderText(
        "aiApiVerification:verifyDialog.meta.modelPlaceholder",
      ),
      { target: { value: "gpt-test" } },
    )

    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.selectedRuntimeKeyIncompatibleHint",
      ),
    ).toBeInTheDocument()
    expect(runButton).toBeDisabled()
    fireEvent.click(runButton)
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("shows i18n summary for unsupported probes", async () => {
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

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "web-search",
      status: "unsupported",
      latencyMs: 0,
      summary: "service-provided summary",
    })

    render(
      <VerifyApiDialog
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

    const probeCard = await screen.findByTestId("verify-probe-web-search")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    // Wait for async token load/selection so the click reliably triggers `runProbe`.
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
    )
    expect(
      await within(probeCard).findByText(
        "aiApiVerification:verifyDialog.unsupportedProbeForApiType",
      ),
    ).toBeInTheDocument()
  })

  it("restores persisted history and clears it", async () => {
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

    const target = requireHistoryTarget(
      createAccountModelVerificationHistoryTarget("a1", "gpt-test"),
    )

    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 5,
          summary: "Stored history",
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected history summary")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(summary)

    render(
      <VerifyApiDialog
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
      await screen.findByText(
        "aiApiVerification:verifyDialog.history.lastVerified",
      ),
    ).toBeInTheDocument()
    expect(await screen.findByText("Stored history")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.history.clear",
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByText("aiApiVerification:verifyDialog.status.unverified"),
      ).toBeInTheDocument()
    })
  })

  it("completes run-all analytics as success when probes pass", async () => {
    mockGetApiVerificationProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
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
    mockRunApiVerificationProbe
      .mockResolvedValueOnce({
        id: "models",
        status: "pass",
        latencyMs: 8,
        summary: "Models listed",
      })
      .mockResolvedValueOnce({
        id: "text-generation",
        status: "pass",
        latencyMs: 12,
        summary: "Text generation succeeded",
      })

    render(
      <VerifyApiDialog
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
      name: "aiApiVerification:verifyDialog.actions.run",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            successCount: 2,
            failureCount: 0,
          },
        },
      )
    })
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelApi,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("stops a running verification suite and aborts the active probe", async () => {
    let receivedSignal: AbortSignal | undefined
    mockGetApiVerificationProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
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
    mockRunApiVerificationProbe.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise((resolve) => {
          abortSignal?.addEventListener(
            "abort",
            () =>
              resolve({
                id: "models",
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
      <VerifyApiDialog
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
      name: "aiApiVerification:verifyDialog.actions.run",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    const stopButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.stop",
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)
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
  })

  it("stops while resolving the full token key before starting a probe", async () => {
    let receivedSignal: AbortSignal | undefined
    mockGetApiVerificationProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "masked-secret",
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
    mockResolveTokenKey.mockImplementationOnce(
      ({
        request,
        token,
      }: {
        request: { abortSignal?: AbortSignal }
        token: { key: string }
      }) => {
        receivedSignal = request.abortSignal
        if (!request.abortSignal) return Promise.resolve(token.key)

        return new Promise<string>((resolve) => {
          request.abortSignal?.addEventListener(
            "abort",
            () => resolve(token.key),
            { once: true },
          )
        })
      },
    )
    mockRunApiVerificationProbe.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Promise((resolve) => {
          abortSignal?.addEventListener(
            "abort",
            () =>
              resolve({
                id: "models",
                status: "fail",
                latencyMs: 1,
                summary: "Stopped late",
              }),
            { once: true },
          )
        }),
    )

    render(
      <VerifyApiDialog
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
      name: "aiApiVerification:verifyDialog.actions.run",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => expect(mockResolveTokenKey).toHaveBeenCalledTimes(1))

    const stopButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.stop",
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    await waitFor(() => {
      expect(
        within(screen.getByTestId("verify-probe-models")).getByRole("button", {
          name: "aiApiVerification:verifyDialog.actions.retry",
        }),
      ).toBeInTheDocument()
    })
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("marks a single probe stopped when its request rejects after cancellation", async () => {
    let receivedSignal: AbortSignal | undefined
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
    mockRunApiVerificationProbe.mockImplementationOnce(
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
      <VerifyApiDialog
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

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    const stopButton = await within(probeCard).findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.stopProbe",
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    expect(
      await within(probeCard).findByText(
        "aiApiVerification:verifyDialog.summaries.stopped",
      ),
    ).toBeInTheDocument()
    expect(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.retry",
      }),
    ).toBeInTheDocument()
  })

  it("completes run-all analytics as failure when any probe fails", async () => {
    mockGetApiVerificationProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
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
    mockRunApiVerificationProbe
      .mockResolvedValueOnce({
        id: "models",
        status: "pass",
        latencyMs: 8,
        summary: "Models listed",
      })
      .mockResolvedValueOnce({
        id: "text-generation",
        status: "fail",
        latencyMs: 12,
        summary: "Request failed",
      })

    render(
      <VerifyApiDialog
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
      name: "aiApiVerification:verifyDialog.actions.run",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            successCount: 1,
            failureCount: 1,
          },
        },
      )
    })
  })

  it("maps structured thrown probe status to an auth analytics failure", async () => {
    mockGetApiVerificationProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
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
    mockRunApiVerificationProbe
      .mockResolvedValueOnce({
        id: "models",
        status: "pass",
        latencyMs: 8,
        summary: "Models listed",
      })
      .mockRejectedValueOnce({
        statusCode: 401,
        message: "Unauthorized",
      })

    render(
      <VerifyApiDialog
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
      name: "aiApiVerification:verifyDialog.actions.run",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            successCount: 1,
            failureCount: 1,
          },
        },
      )
    })
  })

  it("completes run-all analytics as skipped when no probes execute", async () => {
    mockGetApiVerificationProbeDefinitions.mockReturnValue([
      { id: "text-generation", requiresModelId: true },
    ])
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
      <VerifyApiDialog
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

    const runAllButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.run",
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
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })
})
