import { beforeAll, describe, expect, it, vi } from "vitest"

import { VerifyCliSupportDialog } from "~/components/VerifyCliSupportDialog"
import cliSupportVerificationEn from "~/locales/en/cliSupportVerification.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { fireEvent, render, screen, within } from "~/tests/test-utils/render"

const mockFetchAccountTokens = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => mockFetchAccountTokens(...args),
  }),
}))

const mockRunCliSupportTool = vi.fn()

vi.mock("~/services/cliSupportVerification", () => ({
  CLI_TOOL_IDS: ["claude", "codex", "gemini"],
  runCliSupportTool: (...args: any[]) => mockRunCliSupportTool(...args),
}))

describe("VerifyCliSupportDialog", () => {
  beforeAll(() => {
    testI18n.addResourceBundle(
      "en",
      "cliSupportVerification",
      cliSupportVerificationEn,
      true,
      true,
    )
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
        cliSupportVerificationEn.verifyDialog.meta.modelPlaceholder,
      ),
    ).toHaveLength(1)

    expect(
      await screen.findByText(
        cliSupportVerificationEn.verifyDialog.tools.claude,
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        cliSupportVerificationEn.verifyDialog.tools.codex,
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        cliSupportVerificationEn.verifyDialog.tools.gemini,
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
      name: cliSupportVerificationEn.verifyDialog.actions.runOne,
    })
    fireEvent.click(runButton)

    expect(mockRunCliSupportTool).toHaveBeenCalledTimes(1)
    expect(mockRunCliSupportTool).toHaveBeenCalledWith({
      toolId: "claude",
      baseUrl: "https://example.com",
      apiKey: "secret",
      modelId: "gpt-test",
    })

    expect(
      await within(toolCard).findByText(
        cliSupportVerificationEn.verifyDialog.summaries.supported,
      ),
    ).toBeInTheDocument()

    expect(
      within(toolCard).getByRole("button", {
        name: cliSupportVerificationEn.verifyDialog.actions.retry,
      }),
    ).toBeInTheDocument()

    const inputToggle = within(toolCard).getByRole("button", {
      name: cliSupportVerificationEn.verifyDialog.details.input,
    })
    fireEvent.click(inputToggle)
    expect(await within(toolCard).findByText(/"foo": 1/)).toBeInTheDocument()

    const outputToggle = within(toolCard).getByRole("button", {
      name: cliSupportVerificationEn.verifyDialog.details.output,
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
        cliSupportVerificationEn.verifyDialog.requiresModelId,
      ),
    ).toBeInTheDocument()

    const runButton = within(toolCard).getByRole("button", {
      name: cliSupportVerificationEn.verifyDialog.actions.runOne,
    })
    expect(runButton).toBeDisabled()
  })
})
