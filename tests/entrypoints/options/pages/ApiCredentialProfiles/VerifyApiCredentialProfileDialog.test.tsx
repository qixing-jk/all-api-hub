import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import { requireHistoryTarget } from "~~/tests/test-utils/history"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const { loggerErrorMock, mockRunApiVerificationProbe } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  mockRunApiVerificationProbe: vi.fn(),
}))

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...original,
    runApiVerificationProbe: (...args: unknown[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

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
    loggerErrorMock.mockReset()
    mockRunApiVerificationProbe.mockReset()
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockFetchAnthropicModelIds.mockReset()
    mockFetchGoogleModelIds.mockReset()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])
    mockFetchAnthropicModelIds.mockResolvedValue([])
    mockFetchGoogleModelIds.mockResolvedValue([])
    await verificationResultHistoryStorage.clearAllData()
    testI18n.addResourceBundle(
      "en",
      "apiCredentialProfiles",
      {
        verify: {
          override: {
            badge: "Override",
            title: "Temporary API type override",
            description:
              "Saved profile API type: {{savedApiType}}. Current verification API type: {{currentApiType}}. This only affects the current test and will not modify the saved profile.",
          },
        },
      },
      true,
      true,
    )
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

    expect(screen.getByText("Override")).toBeInTheDocument()
    expect(screen.getByText("Temporary API type override")).toBeInTheDocument()
    expect(
      screen.getByText(
        /Saved profile API type: aiApiVerification:verifyDialog\.apiTypes\.openaiCompatible\./,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Current verification API type: aiApiVerification:verifyDialog\.apiTypes\.anthropic\./,
      ),
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
        screen.getByText("aiApiVerification:verifyDialog.history.unverified"),
      ).toBeInTheDocument()
    })
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
})
