import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyApiDialog } from "~/components/VerifyApiDialog"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~/tests/test-utils/render"

const mockFetchAccountTokens = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => mockFetchAccountTokens(...args),
  }),
}))

const mockRunApiVerificationProbe = vi.fn()

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...original,
    runApiVerificationProbe: (...args: any[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

describe("VerifyApiDialog", () => {
  beforeEach(() => {
    // Prevent cross-test leakage from `mockResolvedValueOnce` and call counts.
    mockFetchAccountTokens.mockReset()
    mockRunApiVerificationProbe.mockReset()
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
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    // The action button is disabled until tokens are fetched and a token is selected.
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
})
