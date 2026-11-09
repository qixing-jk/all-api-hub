import { useTranslation } from "react-i18next"

import { VerificationRequestProfileBadge } from "~/features/Verification/api/VerificationRequestProfile"
import { VerificationStatusBadge } from "~/features/Verification/api/VerificationStatusBadge"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"

import { VERIFICATION_HISTORY_KINDS } from "./VerificationHistoryBadge"

/**
 * Render the probe status alongside its recorded generation mode and latency.
 */
export function ProbeStatusBadge({
  result,
  historical = false,
}: {
  result: ApiVerificationProbeResult
  historical?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <>
      <VerificationStatusBadge
        historyKind={historical ? VERIFICATION_HISTORY_KINDS.Probe : undefined}
        status={result.status}
        latencyMs={result.latencyMs}
        mode={result.mode}
        label={
          result.summaryKey === "verifyDialog.summaries.stopped"
            ? t("verifyDialog.status.stopped")
            : result.summaryKey === "verifyDialog.summaries.requestTimedOut"
              ? t("verifyDialog.status.timeout")
              : undefined
        }
      />
      <VerificationRequestProfileBadge
        profile={result.requestProfile}
        enhanced={result.requestProfileEnhanced}
      />
    </>
  )
}
