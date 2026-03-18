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
