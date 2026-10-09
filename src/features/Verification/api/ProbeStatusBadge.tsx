import { VerificationModeBadge } from "~/features/Verification/api/VerificationMode"
import { VerificationStatusBadge } from "~/features/Verification/api/VerificationStatusBadge"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"

/**
 * Render the probe status alongside its recorded generation mode.
 */
export function ProbeStatusBadge({
  result,
}: {
  result: ApiVerificationProbeResult
}) {
  return (
    <>
      <VerificationStatusBadge status={result.status} />
      <VerificationModeBadge mode={result.mode} />
    </>
  )
}
