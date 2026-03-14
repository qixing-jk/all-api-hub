import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const mockFetchAccountTokens = vi.fn()
const mockFetchApiCredentialModelIds = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => mockFetchAccountTokens(...args),
  }),
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
          siteType: "newapi",
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
          siteType: "newapi",
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
          siteType: "newapi",
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
})
