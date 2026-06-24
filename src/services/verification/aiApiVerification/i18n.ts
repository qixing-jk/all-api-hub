import type { TFunction } from "i18next"

import { assertNever } from "~/utils/core/assert"

import {
  API_TYPES,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
} from "./types"

/**
 * Returns the localized label for a supported API verification API type.
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
        `Unexpected API verification type: ${apiType}`,
      )
  }
}

/**
 * Returns the localized label for a supported API verification probe id.
 */
export function getApiVerificationProbeLabel(
  t: TFunction,
  probeId: ApiVerificationProbeId,
): string {
  switch (probeId) {
    case "models":
      return t("aiApiVerification:verifyDialog.probes.models")
    case "text-generation":
      return t("aiApiVerification:verifyDialog.probes.text-generation")
    case "tool-calling":
      return t("aiApiVerification:verifyDialog.probes.tool-calling")
    case "structured-output":
      return t("aiApiVerification:verifyDialog.probes.structured-output")
    case "web-search":
      return t("aiApiVerification:verifyDialog.probes.web-search")
    default:
      return assertNever(
        probeId,
        `Unexpected API verification probe id: ${probeId}`,
      )
  }
}

/**
 * Returns the localized summary text for a known API verification summary key.
 */
export function translateApiVerificationSummary(
  t: TFunction,
  summaryKey: string,
  summaryParams?: Record<string, unknown>,
): string | undefined {
  switch (summaryKey) {
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
      return t(
        "aiApiVerification:verifyDialog.summaries.unauthorized",
        summaryParams,
      )
    case "verifyDialog.summaries.forbidden":
      return t(
        "aiApiVerification:verifyDialog.summaries.forbidden",
        summaryParams,
      )
    case "verifyDialog.summaries.endpointNotFound":
      return t(
        "aiApiVerification:verifyDialog.summaries.endpointNotFound",
        summaryParams,
      )
    case "verifyDialog.summaries.httpError":
      return t(
        "aiApiVerification:verifyDialog.summaries.httpError",
        summaryParams,
      )
    default:
      return undefined
  }
}
