import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyApiDialog } from "~/components/dialogs/VerifyApiDialog"
import { SITE_TYPES } from "~/constants/siteType"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
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

const mockFetchAccountTokens = vi.fn()
const mockStartProductAnalyticsAction = vi.fn()
const mockCompleteProductAnalyticsAction = vi.fn()

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => mockFetchAccountTokens(...args),
    resolveApiTokenKey: async (_request: unknown, token: { key: string }) =>
      token.key,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
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
          userId: 1,
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
          userId: 1,
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
          userId: 1,
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
          insights: {
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
          userId: 1,
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
