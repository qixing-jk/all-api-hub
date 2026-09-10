import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"

import { VerificationModeBadge } from "./VerificationMode"
import { VerificationStatusBadge } from "./VerificationStatusBadge"

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
