import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"

import { VerificationStatusBadge } from "./VerificationStatusBadge"

/**
 * Render a standardized status badge for a probe result.
 */
export function ProbeStatusBadge({
  result,
}: {
  result: ApiVerificationProbeResult
}) {
  return <VerificationStatusBadge status={result.status} />
}
