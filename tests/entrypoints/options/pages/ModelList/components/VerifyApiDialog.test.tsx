import { beforeAll, describe, expect, it, vi } from "vitest"

import { VerifyApiDialog } from "~/entrypoints/options/pages/ModelList/components/VerifyApiDialog"
import modelListEn from "~/locales/en/modelList.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { fireEvent, render, screen, within } from "~/tests/test-utils/render"

const mockFetchAccountTokens = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => mockFetchAccountTokens(...args),
  }),
}))

const mockRunApiVerificationProbe = vi.fn()

vi.mock(
  "~/services/apiVerification/apiVerificationService",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("~/services/apiVerification/apiVerificationService")
      >()
    return {
      ...original,
      runApiVerificationProbe: (...args: any[]) =>
        mockRunApiVerificationProbe(...args),
    }
  },
)

describe("VerifyApiDialog", () => {
  beforeAll(() => {
    testI18n.addResourceBundle("en", "modelList", modelListEn, true, true)
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
      await screen.findByText(
        modelListEn.verifyDialog.probes["text-generation"],
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(modelListEn.verifyDialog.probes["tool-calling"]),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        modelListEn.verifyDialog.probes["structured-output"],
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(modelListEn.verifyDialog.probes["web-search"]),
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

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: modelListEn.verifyDialog.actions.runOne,
    })
    fireEvent.click(runButton)

    expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)

    expect(
      await within(probeCard).findByText("Text generation succeeded"),
    ).toBeInTheDocument()

    expect(
      within(probeCard).getByRole("button", {
        name: modelListEn.verifyDialog.actions.retry,
      }),
    ).toBeInTheDocument()

    const inputToggle = within(probeCard).getByRole("button", {
      name: modelListEn.verifyDialog.details.input,
    })
    fireEvent.click(inputToggle)
    expect(await within(probeCard).findByText(/"foo": 1/)).toBeInTheDocument()

    const outputToggle = within(probeCard).getByRole("button", {
      name: modelListEn.verifyDialog.details.output,
    })
    fireEvent.click(outputToggle)
    expect(await within(probeCard).findByText(/"bar": 2/)).toBeInTheDocument()
  })
})
