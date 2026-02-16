import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { VerifyApiCredentialProfileDialog } from "~/entrypoints/options/pages/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import apiVerificationEn from "~/locales/en/aiApiVerification.json"
import apiCredentialProfilesEn from "~/locales/en/apiCredentialProfiles.json"
import { API_TYPES } from "~/services/aiApiVerification"
import { testI18n } from "~/tests/test-utils/i18n"
import { render, screen, waitFor, within } from "~/tests/test-utils/render"

const mockRunApiVerificationProbe = vi.fn()

vi.mock("~/services/aiApiVerification", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("~/services/aiApiVerification")>()
  return {
    ...original,
    runApiVerificationProbe: (...args: unknown[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

vi.mock("~/services/apiService/anthropic", () => ({
  fetchAnthropicModelIds: vi.fn(),
}))

vi.mock("~/services/apiService/google", () => ({
  fetchGoogleModelIds: vi.fn(),
}))

describe("VerifyApiCredentialProfileDialog", () => {
  beforeAll(() => {
    testI18n.addResourceBundle(
      "en",
      "aiApiVerification",
      apiVerificationEn,
      true,
      true,
    )
    testI18n.addResourceBundle(
      "en",
      "apiCredentialProfiles",
      apiCredentialProfilesEn,
      true,
      true,
    )
  })

  beforeEach(() => {
    mockRunApiVerificationProbe.mockReset()
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])
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
      await screen.findByText(apiVerificationEn.verifyDialog.probes.models),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        apiVerificationEn.verifyDialog.probes["text-generation"],
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        apiVerificationEn.verifyDialog.probes["tool-calling"],
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

    await waitFor(() => {
      expect(screen.getByTestId("profile-verify-model-id")).toHaveTextContent(
        "gpt-4o-mini",
      )
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
        name: apiVerificationEn.verifyDialog.actions.runOne,
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
        name: apiVerificationEn.verifyDialog.details.input,
      }),
    )
    expect(
      await within(probeCard).findByText(/"endpoint":/),
    ).toBeInTheDocument()

    await user.click(
      within(probeCard).getByRole("button", {
        name: apiVerificationEn.verifyDialog.details.output,
      }),
    )
    expect(
      await within(probeCard).findByText(/"modelCount": 1/),
    ).toBeInTheDocument()
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
        name: apiVerificationEn.verifyDialog.actions.runOne,
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
      apiVerificationEn.verifyDialog.actions.close,
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: apiVerificationEn.verifyDialog.actions.run,
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
})
