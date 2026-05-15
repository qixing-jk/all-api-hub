import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import { requireHistoryTarget } from "~~/tests/test-utils/history"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const {
  loggerErrorMock,
  mockGetApiVerificationProbeDefinitions,
  mockRunApiVerificationProbe,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  mockGetApiVerificationProbeDefinitions: vi.fn(),
  mockRunApiVerificationProbe: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
}))

/**
 * Small promise helper for coordinating async storage behavior in tests.
 */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...original,
    getApiVerificationProbeDefinitions: (...args: unknown[]) =>
      mockGetApiVerificationProbeDefinitions(...args) ??
      original.getApiVerificationProbeDefinitions(
        ...(args as Parameters<
          typeof original.getApiVerificationProbeDefinitions
        >),
      ),
    runApiVerificationProbe: (...args: unknown[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    mockStartProductAnalyticsAction(...args),
}))

const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockFetchAnthropicModelIds = vi.fn()
const mockFetchGoogleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

vi.mock("~/services/apiService/anthropic", () => ({
  fetchAnthropicModelIds: (...args: unknown[]) =>
    mockFetchAnthropicModelIds(...args),
}))

vi.mock("~/services/apiService/google", () => ({
  fetchGoogleModelIds: (...args: unknown[]) => mockFetchGoogleModelIds(...args),
}))

vi.mock("~/utils/core/logger", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/utils/core/logger")>()

  return {
    ...original,
    createLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: (...args: unknown[]) => loggerErrorMock(...args),
    }),
  }
})

describe("VerifyApiCredentialProfileDialog", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    loggerErrorMock.mockReset()
    mockGetApiVerificationProbeDefinitions.mockClear()
    mockRunApiVerificationProbe.mockReset()
    mockStartProductAnalyticsAction.mockReset()
    mockCompleteProductAnalyticsAction.mockReset()
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockFetchAnthropicModelIds.mockReset()
    mockFetchGoogleModelIds.mockReset()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])
    mockFetchAnthropicModelIds.mockResolvedValue([])
    mockFetchGoogleModelIds.mockResolvedValue([])
    await verificationResultHistoryStorage.clearAllData()
  })

  it("renders probe items before running", async () => {
    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    expect(
      await screen.findByText("aiApiVerification:verifyDialog.probes.models"),
    ).toBeInTheDocument()
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
  })

  it("auto-fetches model ids on open", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
      "ada-1",
      "gpt-4o-mini",
    ])

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://example.com",
        apiKey: "sk-test",
      }),
    )
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByTestId("profile-verify-model-id")).toHaveTextContent(
        "gpt-4o-mini",
      )
    })
  })

  it("redacts secrets when the initial model fetch fails", async () => {
    mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
      new Error("401 https://example.com sk-test invalid"),
    )

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByText("401 [REDACTED] [REDACTED] invalid"),
      ).toBeInTheDocument()
    })

    expect(screen.queryByText(/sk-test/)).not.toBeInTheDocument()
    expect(loggerErrorMock).toHaveBeenCalledWith("Failed to fetch models", {
      message: "401 [REDACTED] [REDACTED] invalid",
    })
  })

  it("runs a single probe and shows collapsible input/output", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "pass",
      latencyMs: 12,
      summary: "Fetched models",
      input: { endpoint: "/v1/models" },
      output: { modelCount: 1 },
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const probeCard = await screen.findByTestId("profile-verify-probe-models")
    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
    )

    expect(
      await within(probeCard).findByText("Fetched models"),
    ).toBeInTheDocument()
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbe,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.details.input",
      }),
    )
    expect(
      await within(probeCard).findByText(/"endpoint":/),
    ).toBeInTheDocument()

    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.details.output",
      }),
    )
    expect(
      await within(probeCard).findByText(/"modelCount": 1/),
    ).toBeInTheDocument()
  })

  it("redacts baseUrl and apiKey when a probe throws", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockRejectedValueOnce(
      new Error("https://example.com sk-test probe failed"),
    )

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const probeCard = await screen.findByTestId("profile-verify-probe-models")
    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(loggerErrorMock).toHaveBeenCalledWith("Probe failed", {
        probeId: "models",
        message: "[REDACTED] [REDACTED] probe failed",
      }),
    )
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("auto-fills model id from the models probe output", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "pass",
      latencyMs: 12,
      summary: "Fetched models",
      output: {
        modelCount: 2,
        suggestedModelId: "m2",
        modelIdsPreview: ["m1", "m2"],
      },
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const modelsProbeCard = await screen.findByTestId(
      "profile-verify-probe-models",
    )
    await user.click(
      within(modelsProbeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
    )

    await waitFor(() => {
      expect(screen.getByTestId("profile-verify-model-id")).toHaveTextContent(
        "m2",
      )
    })
  })

  it("allows temporarily switching apiType for profile verification", async () => {
    const user = userEvent.setup()

    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])
    mockFetchAnthropicModelIds.mockResolvedValueOnce(["claude-3-5-sonnet"])
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "pass",
      latencyMs: 10,
      summary: "Fetched models",
      output: {
        modelCount: 1,
        suggestedModelId: "claude-3-5-sonnet",
        modelIdsPreview: ["claude-3-5-sonnet"],
      },
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://example.com",
        apiKey: "sk-test",
      }),
    )

    const apiTypeSelect = screen.getAllByRole("combobox")[0]
    await user.click(apiTypeSelect)
    await user.click(
      await screen.findByText(
        "aiApiVerification:verifyDialog.apiTypes.anthropic",
      ),
    )

    expect(
      screen.getByText("apiCredentialProfiles:verify.override.badge"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("apiCredentialProfiles:verify.override.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("apiCredentialProfiles:verify.override.description"),
    ).toBeInTheDocument()

    await waitFor(() =>
      expect(mockFetchAnthropicModelIds).toHaveBeenCalledWith({
        baseUrl: "https://example.com",
        apiKey: "sk-test",
      }),
    )

    const modelsProbeCard = await screen.findByTestId(
      "profile-verify-probe-models",
    )
    await user.click(
      within(modelsProbeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiType: API_TYPES.ANTHROPIC,
          probeId: "models",
        }),
      ),
    )
  })

  it("run all uses models probe suggestion for dependent probes", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockImplementation(async (params: any) => {
      if (params.probeId === "models") {
        return {
          id: "models",
          status: "pass",
          latencyMs: 1,
          summary: "Fetched models",
          output: {
            modelCount: 2,
            suggestedModelId: "m1",
            modelIdsPreview: ["m1", "m2"],
          },
        }
      }

      return {
        id: params.probeId,
        status: "pass",
        latencyMs: 1,
        summary: "OK",
      }
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(5),
    )

    expect(mockRunApiVerificationProbe).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        probeId: "models",
        modelId: undefined,
      }),
    )

    expect(mockRunApiVerificationProbe).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        probeId: "text-generation",
        modelId: "m1",
      }),
    )
  })

  it("tracks API credential verification suite success", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockImplementation(async (params: any) => ({
      id: params.probeId,
      status: "pass",
      latencyMs: 1,
      summary: "OK",
      output:
        params.probeId === "models"
          ? {
              suggestedModelId: "m1",
              modelIdsPreview: ["m1"],
            }
          : undefined,
    }))

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 5,
            successCount: 5,
            failureCount: 0,
          },
        },
      ),
    )

    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbeSuite,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("tracks API credential verification suite failures with an error category", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "fail",
      latencyMs: 1,
      summary: "Unauthorized",
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: 1,
            successCount: 0,
            failureCount: 1,
          },
        },
      ),
    )
  })

  it("tracks API credential verification suite-level exceptions with an error category", async () => {
    const user = userEvent.setup()

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    mockGetApiVerificationProbeDefinitions.mockImplementationOnce(() => {
      throw new Error("definitions failed")
    })

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      ),
    )
  })

  it("restores persisted history and clears it", async () => {
    const user = userEvent.setup()

    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("p-1"),
    )

    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 9,
          summary: "Stored profile history",
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected history summary")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(summary)

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.history.lastVerified",
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("Stored profile history"),
    ).toBeInTheDocument()

    await user.click(
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

  it("reloads persisted history for the active model and api type", async () => {
    const user = userEvent.setup()

    mockFetchOpenAICompatibleModelIds.mockResolvedValue(["m0", "m1"])
    mockFetchAnthropicModelIds.mockResolvedValue(["claude-3-5-sonnet"])

    const initialTarget = requireHistoryTarget(
      createProfileModelVerificationHistoryTarget("p-1", "m0"),
    )
    const selectedTarget = requireHistoryTarget(
      createProfileModelVerificationHistoryTarget("p-1", "m1"),
    )

    const initialSummary = createVerificationHistorySummary({
      target: initialTarget,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      preferredModelId: "m0",
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 3,
          summary: "Stored m0 history",
        },
      ],
    })
    const selectedSummary = createVerificationHistorySummary({
      target: selectedTarget,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      preferredModelId: "m1",
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 4,
          summary: "Stored m1 history",
        },
      ],
    })

    if (!initialSummary || !selectedSummary) {
      throw new Error("Expected history summaries")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(initialSummary)
    await verificationResultHistoryStorage.upsertLatestSummary(selectedSummary)

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="m0"
      />,
    )

    expect(await screen.findByText("Stored m0 history")).toBeInTheDocument()

    await user.click(screen.getByTestId("profile-verify-model-id"))
    await user.click(await screen.findByText("m1"))

    await waitFor(() => {
      expect(screen.getByTestId("profile-verify-model-id")).toHaveTextContent(
        "m1",
      )
    })
    expect(await screen.findByText("Stored m1 history")).toBeInTheDocument()
    expect(screen.queryByText("Stored m0 history")).not.toBeInTheDocument()

    const apiTypeSelect = screen.getAllByRole("combobox")[0]
    await user.click(apiTypeSelect)
    await user.click(
      await screen.findByText(
        "aiApiVerification:verifyDialog.apiTypes.anthropic",
      ),
    )

    await waitFor(() => {
      expect(
        screen.getByText("aiApiVerification:verifyDialog.status.unverified"),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText("Stored m1 history")).not.toBeInTheDocument()

    await user.click(screen.getAllByRole("combobox")[0])
    await user.click(
      await screen.findByText(
        "aiApiVerification:verifyDialog.apiTypes.openaiCompatible",
      ),
    )

    expect(await screen.findByText("Stored m1 history")).toBeInTheDocument()
  })

  it("persists and clears history for the currently selected model target", async () => {
    const user = userEvent.setup()

    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m0", "m1"])
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 7,
      summary: "Generated text",
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="m0"
      />,
    )

    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://example.com",
        apiKey: "sk-test",
      }),
    )

    await user.click(screen.getByTestId("profile-verify-model-id"))
    await user.click(await screen.findByText("m1"))

    await waitFor(() => {
      expect(screen.getByTestId("profile-verify-model-id")).toHaveTextContent(
        "m1",
      )
    })

    const probeCard = await screen.findByTestId(
      "profile-verify-probe-text-generation",
    )
    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          probeId: "text-generation",
          modelId: "m1",
        }),
      ),
    )

    const initialTarget = requireHistoryTarget(
      createProfileModelVerificationHistoryTarget("p-1", "m0"),
    )
    const selectedTarget = requireHistoryTarget(
      createProfileModelVerificationHistoryTarget("p-1", "m1"),
    )

    expect(
      await verificationResultHistoryStorage.getLatestSummary(initialTarget),
    ).toBeNull()
    expect(
      await verificationResultHistoryStorage.getLatestSummary(selectedTarget),
    ).toMatchObject({
      targetKey: "profile:p-1:model:m1",
      resolvedModelId: "m1",
    })

    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.history.clear",
      }),
    )

    await waitFor(async () => {
      expect(
        await verificationResultHistoryStorage.getLatestSummary(selectedTarget),
      ).toBeNull()
    })
  })

  it("waits for persistence to settle before enabling close controls", async () => {
    const user = userEvent.setup()
    const persistDeferred =
      createDeferred<
        Awaited<
          ReturnType<
            typeof verificationResultHistoryStorage.upsertLatestSummary
          >
        >
      >()
    vi.spyOn(
      verificationResultHistoryStorage,
      "upsertLatestSummary",
    ).mockImplementation(() => persistDeferred.promise)

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "pass",
      latencyMs: 12,
      summary: "Fetched models",
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.close",
    })
    const clearButton = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.history.clear",
    })
    const probeCard = await screen.findByTestId("profile-verify-probe-models")

    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() => {
      expect(within(probeCard).getByText("Fetched models")).toBeInTheDocument()
      expect(closeButton).toBeDisabled()
      expect(clearButton).toBeDisabled()
    })

    persistDeferred.reject(new Error("persist failed"))

    await waitFor(() => {
      expect(closeButton).toBeEnabled()
      expect(clearButton).toBeEnabled()
    })

    expect(within(probeCard).getByText("Fetched models")).toBeInTheDocument()
    expect(
      screen.queryByText("aiApiVerification:verifyDialog.errors.unexpected"),
    ).not.toBeInTheDocument()
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Failed to persist verification history",
      {
        error: expect.any(Error),
      },
    )
  })
})
