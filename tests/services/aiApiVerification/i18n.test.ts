import { describe, expect, it, vi } from "vitest"

import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"
import { API_TYPES } from "~/services/verification/aiApiVerification/types"

describe("aiApiVerification i18n", () => {
  it("does not append the English forbidden fallback to a translated summary", () => {
    const t = vi.fn((_key: string, options?: { lng?: string }) =>
      options?.lng === "en" ? "Forbidden (403): access denied" : "权限不足",
    )
    expect(
      translateApiVerificationSummary(
        t as any,
        "verifyDialog.summaries.forbidden",
        undefined,
        "Forbidden (403): access denied",
      ),
    ).toBe("权限不足")
  })
  it.each([
    "verifyDialog.summaries.unauthorized",
    "verifyDialog.summaries.forbidden",
    "verifyDialog.summaries.endpointNotFound",
  ])(
    "retains HTTP diagnostics and falls back to localized copy for %s",
    (key) => {
      const t = vi.fn(() => "Localized HTTP failure")
      expect(
        translateApiVerificationSummary(
          t as any,
          key,
          undefined,
          "Provider recovery guidance",
        ),
      ).toBe("Localized HTTP failure\nProvider recovery guidance")
      expect(
        translateApiVerificationSummary(t as any, key, undefined, "  "),
      ).toBe("Localized HTTP failure")
      expect(
        translateApiVerificationSummary(
          t as any,
          key,
          undefined,
          "Localized HTTP failure",
        ),
      ).toBe("Localized HTTP failure")
    },
  )

  it.each([
    [
      API_TYPES.OPENAI_COMPATIBLE,
      "aiApiVerification:verifyDialog.apiTypes.openaiCompatible",
    ],
    [API_TYPES.OPENAI, "aiApiVerification:verifyDialog.apiTypes.openai"],
    [API_TYPES.ANTHROPIC, "aiApiVerification:verifyDialog.apiTypes.anthropic"],
    [API_TYPES.GOOGLE, "aiApiVerification:verifyDialog.apiTypes.google"],
  ])("returns the correct label key for apiType %s", (apiType, expectedKey) => {
    const t = vi.fn((key: string) => key)

    const result = getApiVerificationApiTypeLabel(t as any, apiType)

    expect(result).toBe(expectedKey)
    expect(t).toHaveBeenCalledWith(expectedKey)
  })

  it.each([
    ["models", "aiApiVerification:verifyDialog.probes.models"],
    [
      "text-generation",
      "aiApiVerification:verifyDialog.probes.text-generation",
    ],
    ["tool-calling", "aiApiVerification:verifyDialog.probes.tool-calling"],
    [
      "structured-output",
      "aiApiVerification:verifyDialog.probes.structured-output",
    ],
    ["web-search", "aiApiVerification:verifyDialog.probes.web-search"],
    ["embedding", "aiApiVerification:verifyDialog.probes.embedding"],
    ["rerank", "aiApiVerification:verifyDialog.probes.rerank"],
    [
      "image-generation",
      "aiApiVerification:verifyDialog.probes.image-generation",
    ],
    [
      "video-generation",
      "aiApiVerification:verifyDialog.probes.video-generation",
    ],
    ["decision", "aiApiVerification:verifyDialog.probes.decision"],
  ])("returns the correct label key for probe %s", (probeId, expectedKey) => {
    const t = vi.fn((key: string) => key)

    const result = getApiVerificationProbeLabel(t as any, probeId as any)

    expect(result).toBe(expectedKey)
    expect(t).toHaveBeenCalledWith(expectedKey)
  })

  it.each([
    "verifyDialog.summaries.modelsFetched",
    "verifyDialog.summaries.videoUnexpectedResponse",
    "verifyDialog.summaries.videoGenerationSucceeded",
    "verifyDialog.summaries.videoGenerationTimedOut",
    "verifyDialog.summaries.videoNoPlayableResult",
    "verifyDialog.summaries.probeRequiresOpenAiProtocol",
    "verifyDialog.summaries.noModelsReturned",
    "verifyDialog.summaries.textGenerationSucceeded",
    "verifyDialog.summaries.textGenerationUnexpectedResponse",
    "verifyDialog.summaries.noToolCallDetected",
    "verifyDialog.summaries.toolCallSucceeded",
    "verifyDialog.summaries.structuredOutputSucceeded",
    "verifyDialog.summaries.structuredOutputInvalid",
    "verifyDialog.summaries.webSearchUnsupportedAnthropic",
    "verifyDialog.summaries.webSearchSucceeded",
    "verifyDialog.summaries.webSearchNoResults",
    "verifyDialog.summaries.webSearchGroundingSucceeded",
    "verifyDialog.summaries.webSearchGroundingNoResults",
    "verifyDialog.summaries.webSearchUnsupportedForApiType",
    "verifyDialog.summaries.webSearchRequiresExplicitSupport",
    "verifyDialog.summaries.modelsProbeUnsupportedForApiType",
    "verifyDialog.summaries.noModelIdProvided",
    "verifyDialog.summaries.noModelIdProvidedToRunProbe",
    "verifyDialog.summaries.noModelIdProvidedToRunProbes",
    "verifyDialog.summaries.noModelAvailableToRunProbes",
    "verifyDialog.summaries.unauthorized",
    "verifyDialog.summaries.forbidden",
    "verifyDialog.summaries.endpointNotFound",
    "verifyDialog.summaries.httpError",
    "verifyDialog.summaries.embeddingSucceeded",
    "verifyDialog.summaries.embeddingUnexpectedResponse",
    "verifyDialog.summaries.embeddingUnsupportedAnthropic",
    "verifyDialog.summaries.rerankSucceeded",
    "verifyDialog.summaries.rerankUnexpectedResponse",
    "verifyDialog.summaries.imageGenerationSucceeded",
    "verifyDialog.summaries.imageGenerationNoData",
    "verifyDialog.summaries.videoTaskAccepted",
    "verifyDialog.summaries.videoNoTaskReturned",
    "verifyDialog.summaries.decisionSucceeded",
    "verifyDialog.summaries.decisionUnexpectedResponse",
  ])("translates known summary key %s with forwarded params", (summaryKey) => {
    const params = { count: 2, modelId: "gpt-test" }
    const expectedKey = `aiApiVerification:${summaryKey}`
    const t = vi.fn((key: string, forwardedParams?: Record<string, unknown>) =>
      JSON.stringify({ key, forwardedParams }),
    )

    const result = translateApiVerificationSummary(t as any, summaryKey, params)

    expect(result).toBe(
      JSON.stringify({ key: expectedKey, forwardedParams: params }),
    )
    expect(t).toHaveBeenCalledWith(expectedKey, params)
  })

  it("returns undefined without calling t for unknown summary keys", () => {
    const t = vi.fn((key: string) => key)

    const result = translateApiVerificationSummary(
      t as any,
      "unknown.summary.key",
    )

    expect(result).toBeUndefined()
    expect(t).not.toHaveBeenCalled()
  })

  it("translates webAiApiCheck runProbeFailed with forwarded params", () => {
    const summaryKey = "webAiApiCheck:modal.errors.runProbeFailed"
    const params = { message: "Network error" }
    const t = vi.fn((key: string, forwardedParams?: Record<string, unknown>) =>
      JSON.stringify({ key, forwardedParams }),
    )

    const result = translateApiVerificationSummary(t as any, summaryKey, params)

    expect(result).toBe(
      JSON.stringify({ key: summaryKey, forwardedParams: params }),
    )
    expect(t).toHaveBeenCalledWith(summaryKey, params)
  })
})
