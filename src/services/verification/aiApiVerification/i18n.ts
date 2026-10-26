import type { TFunction } from "i18next"

import { PELICAN_PROMPT_ID } from "~/services/verification/modelQuality/constants"
import { assertNever } from "~/utils/core/assert"

import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbeId,
} from "./types"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
} from "./types"

/** Returns the localized label for the explicitly selected generation mode. */
export function getApiVerificationModeLabel(
  t: TFunction,
  mode: ApiVerificationMode,
): string {
  switch (mode) {
    case API_VERIFICATION_MODES.Streaming:
      return t("aiApiVerification:verifyDialog.modes.streaming")
    case API_VERIFICATION_MODES.NonStreaming:
      return t("aiApiVerification:verifyDialog.modes.nonStreaming")
    default:
      return assertNever(mode, "Unexpected API verification mode")
  }
}

/**
 * Returns the localized label for a supported API verification type.
 */
export function getApiVerificationApiTypeLabel(
  t: TFunction,
  apiType: ApiVerificationApiType,
): string {
  switch (apiType) {
    case API_TYPES.OPENAI_COMPATIBLE:
      return t("aiApiVerification:verifyDialog.apiTypes.openaiCompatible")
    case API_TYPES.OPENAI:
      return t("aiApiVerification:verifyDialog.apiTypes.openai")
    case API_TYPES.ANTHROPIC:
      return t("aiApiVerification:verifyDialog.apiTypes.anthropic")
    case API_TYPES.GOOGLE:
      return t("aiApiVerification:verifyDialog.apiTypes.google")
    default:
      return assertNever(
        apiType,
        `Unexpected API verification apiType: ${apiType}`,
      )
  }
}

/**
 * Returns the localized label for a supported API verification probe id.
 */
export function getApiVerificationProbeLabel(
  t: TFunction,
  probeId: ApiVerificationProbeId | typeof PELICAN_PROMPT_ID,
): string {
  if (probeId === PELICAN_PROMPT_ID) {
    return t("aiApiVerification:verifyDialog.tools.pelican.title")
  }
  switch (probeId) {
    case API_VERIFICATION_PROBE_IDS.Models:
      return t("aiApiVerification:verifyDialog.probes.models")
    case API_VERIFICATION_PROBE_IDS.TextGeneration:
      return t("aiApiVerification:verifyDialog.probes.text-generation")
    case API_VERIFICATION_PROBE_IDS.ToolCalling:
      return t("aiApiVerification:verifyDialog.probes.tool-calling")
    case API_VERIFICATION_PROBE_IDS.StructuredOutput:
      return t("aiApiVerification:verifyDialog.probes.structured-output")
    case API_VERIFICATION_PROBE_IDS.WebSearch:
      return t("aiApiVerification:verifyDialog.probes.web-search")
    case API_VERIFICATION_PROBE_IDS.Embedding:
      return t("aiApiVerification:verifyDialog.probes.embedding")
    case API_VERIFICATION_PROBE_IDS.Rerank:
      return t("aiApiVerification:verifyDialog.probes.rerank")
    case API_VERIFICATION_PROBE_IDS.ImageGeneration:
      return t("aiApiVerification:verifyDialog.probes.image-generation")
    case API_VERIFICATION_PROBE_IDS.VideoGeneration:
      return t("aiApiVerification:verifyDialog.probes.video-generation")
    case API_VERIFICATION_PROBE_IDS.Decision:
      return t("aiApiVerification:verifyDialog.probes.decision")
    default:
      return assertNever(
        probeId,
        `Unexpected API verification probe id: ${probeId}`,
      )
  }
}

/**
 * Returns localized summary text, retaining sanitized upstream HTTP diagnostics.
 * `sanitizedSummary` must already have credentials and sensitive URL data removed.
 */
export function translateApiVerificationSummary(
  t: TFunction,
  summaryKey: string,
  summaryParams?: Record<string, unknown>,
  sanitizedSummary?: string,
): string | undefined {
  const withHttpDetails = (localized: string): string => {
    const detail = sanitizedSummary?.trim()
    const fallback = t(`aiApiVerification:${summaryKey}`, {
      ...summaryParams,
      lng: "en",
    })
    return detail && detail !== localized && detail !== fallback
      ? `${localized}\n${detail}`
      : localized
  }
  switch (summaryKey) {
    case "verifyDialog.errors.unexpected":
      return t(
        "aiApiVerification:verifyDialog.errors.unexpected",
        summaryParams,
      )
    case "webAiApiCheck:modal.errors.runProbeFailed":
      return t("webAiApiCheck:modal.errors.runProbeFailed", summaryParams)
    case "verifyDialog.requiresModelId":
      return t("aiApiVerification:verifyDialog.requiresModelId", summaryParams)
    case "verifyDialog.summaries.modelsFetched":
      return t(
        "aiApiVerification:verifyDialog.summaries.modelsFetched",
        summaryParams,
      )
    case "verifyDialog.summaries.noModelsReturned":
      return t(
        "aiApiVerification:verifyDialog.summaries.noModelsReturned",
        summaryParams,
      )
    case "verifyDialog.summaries.requestProfileIncompatible":
      return t(
        "aiApiVerification:verifyDialog.summaries.requestProfileIncompatible",
        summaryParams,
      )
    case "verifyDialog.summaries.textGenerationSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.textGenerationSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.textGenerationUnexpectedResponse":
      return t(
        "aiApiVerification:verifyDialog.summaries.textGenerationUnexpectedResponse",
        summaryParams,
      )
    case "verifyDialog.summaries.noToolCallDetected":
      return t(
        "aiApiVerification:verifyDialog.summaries.noToolCallDetected",
        summaryParams,
      )
    case "verifyDialog.summaries.stopped":
      return t(
        "aiApiVerification:verifyDialog.summaries.stopped",
        summaryParams,
      )
    case "verifyDialog.summaries.toolCallSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.toolCallSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.structuredOutputSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.structuredOutputSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.structuredOutputInvalid":
      return t(
        "aiApiVerification:verifyDialog.summaries.structuredOutputInvalid",
        summaryParams,
      )
    case "verifyDialog.summaries.webSearchUnsupportedAnthropic":
      return t(
        "aiApiVerification:verifyDialog.summaries.webSearchUnsupportedAnthropic",
        summaryParams,
      )
    case "verifyDialog.summaries.webSearchSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.webSearchSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.webSearchNoResults":
      return t(
        "aiApiVerification:verifyDialog.summaries.webSearchNoResults",
        summaryParams,
      )
    case "verifyDialog.summaries.webSearchGroundingSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.webSearchGroundingSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.webSearchGroundingNoResults":
      return t(
        "aiApiVerification:verifyDialog.summaries.webSearchGroundingNoResults",
        summaryParams,
      )
    case "verifyDialog.summaries.webSearchUnsupportedForApiType":
      return t(
        "aiApiVerification:verifyDialog.summaries.webSearchUnsupportedForApiType",
        summaryParams,
      )
    case "verifyDialog.summaries.webSearchRequiresExplicitSupport":
      return t(
        "aiApiVerification:verifyDialog.summaries.webSearchRequiresExplicitSupport",
        summaryParams,
      )
    case "verifyDialog.summaries.modelsProbeUnsupportedForApiType":
      return t(
        "aiApiVerification:verifyDialog.summaries.modelsProbeUnsupportedForApiType",
        summaryParams,
      )
    case "verifyDialog.summaries.noModelIdProvided":
      return t(
        "aiApiVerification:verifyDialog.summaries.noModelIdProvided",
        summaryParams,
      )
    case "verifyDialog.summaries.noModelIdProvidedToRunProbe":
      return t(
        "aiApiVerification:verifyDialog.summaries.noModelIdProvidedToRunProbe",
        summaryParams,
      )
    case "verifyDialog.summaries.noModelIdProvidedToRunProbes":
      return t(
        "aiApiVerification:verifyDialog.summaries.noModelIdProvidedToRunProbes",
        summaryParams,
      )
    case "verifyDialog.summaries.noModelAvailableToRunProbes":
      return t(
        "aiApiVerification:verifyDialog.summaries.noModelAvailableToRunProbes",
        summaryParams,
      )
    case "verifyDialog.summaries.unauthorized":
      return withHttpDetails(
        t(
          "aiApiVerification:verifyDialog.summaries.unauthorized",
          summaryParams,
        ),
      )
    case "verifyDialog.summaries.forbidden":
      return withHttpDetails(
        t("aiApiVerification:verifyDialog.summaries.forbidden", summaryParams),
      )
    case "verifyDialog.summaries.endpointNotFound":
      return withHttpDetails(
        t(
          "aiApiVerification:verifyDialog.summaries.endpointNotFound",
          summaryParams,
        ),
      )
    case "verifyDialog.summaries.httpError":
      return t(
        "aiApiVerification:verifyDialog.summaries.httpError",
        summaryParams,
      )
    case "verifyDialog.summaries.embeddingSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.embeddingSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.embeddingUnexpectedResponse":
      return t(
        "aiApiVerification:verifyDialog.summaries.embeddingUnexpectedResponse",
        summaryParams,
      )
    case "verifyDialog.summaries.embeddingUnsupportedAnthropic":
      return t(
        "aiApiVerification:verifyDialog.summaries.embeddingUnsupportedAnthropic",
        summaryParams,
      )
    case "verifyDialog.summaries.rerankSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.rerankSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.rerankUnexpectedResponse":
      return t(
        "aiApiVerification:verifyDialog.summaries.rerankUnexpectedResponse",
        summaryParams,
      )
    case "verifyDialog.summaries.imageGenerationSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.imageGenerationSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.imageGenerationNoData":
      return t(
        "aiApiVerification:verifyDialog.summaries.imageGenerationNoData",
        summaryParams,
      )
    case "verifyDialog.summaries.videoGenerationTimedOut":
      return t(
        "aiApiVerification:verifyDialog.summaries.videoGenerationTimedOut",
        summaryParams,
      )
    case "verifyDialog.summaries.videoNoPlayableResult":
      return t(
        "aiApiVerification:verifyDialog.summaries.videoNoPlayableResult",
        summaryParams,
      )
    case "verifyDialog.summaries.videoGenerationSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.videoGenerationSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.videoTaskAccepted":
      return t(
        "aiApiVerification:verifyDialog.summaries.videoTaskAccepted",
        summaryParams,
      )
    case "verifyDialog.summaries.videoUnexpectedResponse":
      return t(
        "aiApiVerification:verifyDialog.summaries.videoUnexpectedResponse",
        summaryParams,
      )
    case "verifyDialog.summaries.probeRequiresOpenAiProtocol":
      return t(
        "aiApiVerification:verifyDialog.summaries.probeRequiresOpenAiProtocol",
        summaryParams,
      )
    case "verifyDialog.summaries.videoNoTaskReturned":
      return t(
        "aiApiVerification:verifyDialog.summaries.videoNoTaskReturned",
        summaryParams,
      )
    case "verifyDialog.summaries.decisionSucceeded":
      return t(
        "aiApiVerification:verifyDialog.summaries.decisionSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.decisionUnexpectedResponse":
      return t(
        "aiApiVerification:verifyDialog.summaries.decisionUnexpectedResponse",
        summaryParams,
      )
    default:
      return undefined
  }
}
