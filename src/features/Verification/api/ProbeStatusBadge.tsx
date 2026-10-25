import { VerificationRequestProfileBadge } from "~/features/Verification/api/VerificationRequestProfile"
import { VerificationStatusBadge } from "~/features/Verification/api/VerificationStatusBadge"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"

/**
 * Render the probe status alongside its recorded generation mode and latency.
 */
export function ProbeStatusBadge({
  result,
}: {
  result: ApiVerificationProbeResult
}) {
  return (
    <>
      <VerificationStatusBadge
        status={result.status}
        latencyMs={result.latencyMs}
        mode={result.mode}
      />
      <VerificationRequestProfileBadge
        profile={result.requestProfile}
        enhanced={result.requestProfileEnhanced}
      />
    </>
  )
}
