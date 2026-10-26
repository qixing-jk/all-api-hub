import { VerificationStatusBadge } from "~/features/Verification/api/VerificationStatusBadge"
import type { CliSupportResult } from "~/services/verification/cliSupportVerification"

/**
 * Render a standardized status badge for a CLI tool result.
 */
export function ToolStatusBadge({ result }: { result: CliSupportResult }) {
  return (
    <VerificationStatusBadge
      status={result.status}
      latencyMs={result.latencyMs}
      mode={result.mode}
    />
  )
}
