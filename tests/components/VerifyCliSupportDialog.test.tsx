import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const mockFetchAccountTokens = vi.fn()
const mockFetchApiCredentialModelIds = vi.fn()
const mockResolveDisplayAccountTokenForSecret = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => mockFetchAccountTokens(...args),
    resolveApiTokenKey: async (_request: unknown, token: { key: string }) =>
      token.key,
  }),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountTokenForSecret: (...args: any[]) =>
    mockResolveDisplayAccountTokenForSecret(...args),
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
    mockFetchApiCredentialModelIds.mockReset()
    mockFetchApiCredentialModelIds.mockResolvedValue([])
    mockResolveDisplayAccountTokenForSecret.mockReset()
    mockResolveDisplayAccountTokenForSecret.mockImplementation(
      async (_account, token) => token,
    )
    mockRunCliSupportTool.mockReset()
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

    const toolCard = await screen.findByTestId("verify-cli-claude")
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockRunCliSupportTool).toHaveBeenCalledWith({
        toolId: "claude",
        baseUrl: "https://example.com",
        apiKey: "profile-secret",
        modelId: "gpt-test",
      })
    })

    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
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
      expect(mockFetchApiCredentialModelIds).toHaveBeenCalledWith({
        apiType: "openai-compatible",
        baseUrl: "https://example.com",
        apiKey: "profile-secret",
      })
    })

    const modelPicker = screen.getByRole("combobox", {
      name: "cliSupportVerification:verifyDialog.meta.model",
    })
    fireEvent.click(modelPicker)
    fireEvent.click(await screen.findByRole("option", { name: "gpt-4o-mini" }))

    expect(modelPicker).toHaveTextContent("gpt-4o-mini")
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
          userId: 1,
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
          userId: 1,
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
          userId: 1,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId("verify-cli-claude")
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockRunCliSupportTool).toHaveBeenCalledTimes(1)
      expect(mockRunCliSupportTool).toHaveBeenCalledWith({
        toolId: "claude",
        baseUrl: "https://example.com",
        apiKey: "secret",
        modelId: "gpt-test",
      })
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
          userId: 1,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId("verify-cli-gemini")
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
          userId: 1,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId=""
      />,
    )

    const toolCard = await screen.findByTestId("verify-cli-codex")
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
          userId: 1,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId=""
      />,
    )

    expect(
      await screen.findByText("cliSupportVerification:verifyDialog.modelHint"),
    ).toBeInTheDocument()

    const toolCard = await screen.findByTestId("verify-cli-codex")
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockRunCliSupportTool).toHaveBeenCalledWith({
        toolId: "codex",
        baseUrl: "https://example.com",
        apiKey: "disabled-secret",
        modelId: "claude-3-5-sonnet",
      })
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
          userId: 1,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-explicit"
      />,
    )

    await screen.findByTestId("verify-cli-claude")
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
          userId: 1,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId("verify-cli-claude")
    const runButton = within(toolCard).getByRole("button", {
      name: "cliSupportVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockResolveDisplayAccountTokenForSecret).toHaveBeenCalledTimes(1)
      expect(mockRunCliSupportTool).toHaveBeenCalledWith({
        toolId: "claude",
        baseUrl: "https://example.com",
        apiKey: "resolved-secret",
        modelId: "gpt-test",
      })
    })
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
          userId: 1,
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

    const toolCard = await screen.findByTestId("verify-cli-claude")
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
          userId: 1,
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
          userId: 1,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId("verify-cli-claude")
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
          userId: 1,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
        }}
        initialModelId="gpt-test"
      />,
    )

    const toolCard = await screen.findByTestId("verify-cli-codex")
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
})
