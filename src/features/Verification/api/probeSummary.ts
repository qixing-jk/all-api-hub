import type { TFunction } from "i18next"

import {
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"

/** Shared account/credential summary precedence; callers own model readiness. */
export function getVerificationProbeSummary(
  t: TFunction,
  probeId: ApiVerificationProbeId,
  result: ApiVerificationProbeResult | null,
): string | null {
  if (!result) return null
  if (result.summaryKey) {
    return (
      translateApiVerificationSummary(
        t,
        result.summaryKey,
        result.summaryParams,
        result.summary,
      ) ?? result.summary
    )
  }
  if (result.status === API_VERIFICATION_PROBE_STATUSES.Unsupported) {
    return t("aiApiVerification:verifyDialog.unsupportedProbeForApiType", {
      probe: getApiVerificationProbeLabel(t, probeId),
    })
  }
  return result.summary
}
