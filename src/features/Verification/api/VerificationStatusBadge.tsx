import { CircleCheck, CircleX } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { formatLatency } from "~/features/Verification/api/utils"
import { cn } from "~/lib/utils"
import {
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationMode,
  type ApiVerificationProbeStatus,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationModeLabel } from "~/services/verification/aiApiVerification/i18n"
import {
  API_VERIFICATION_HISTORY_STATUSES,
  type ApiVerificationHistoryDisplayStatus,
} from "~/services/verification/verificationResultHistory"

export type VerificationStatusBadgeProps = {
  status: ApiVerificationProbeStatus | ApiVerificationHistoryDisplayStatus
  latencyMs?: number | null
  mode?: ApiVerificationMode
  className?: string
  label?: string
}

/**
 * Render a standardized status badge for verification results and persisted
 * verification summaries.
 * Keep the result visible even when latency and generation mode are available.
 */
export function VerificationStatusBadge({
  status,
  latencyMs,
  mode,
  className,
  label,
}: VerificationStatusBadgeProps) {
  const { t } = useTranslation("aiApiVerification")
  const modeLabel = mode ? getApiVerificationModeLabel(t, mode) : null
  const modeContent = modeLabel ? (
    <>
      <span aria-hidden="true" className="opacity-40">
        ·
      </span>
      <span className="font-normal">{modeLabel}</span>
    </>
  ) : null

  if (status === API_VERIFICATION_PROBE_STATUSES.Pass) {
    const latencyText =
      latencyMs != null && latencyMs > 0 ? formatLatency(latencyMs) : null
    return (
      <Badge variant="success" size="sm" className={className}>
        <span className="gap-y-density-1 flex items-center gap-x-1">
          <CircleCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? t("verifyDialog.status.pass")}</span>
        </span>
        {latencyText ? (
          <span className="font-normal">{latencyText}</span>
        ) : null}
        {modeContent}
      </Badge>
    )
  }

  if (status === API_VERIFICATION_PROBE_STATUSES.Unsupported) {
    return (
      <Badge
        variant="outline"
        size="sm"
        className={cn(
          "border-border-subtle bg-surface-subtle text-muted-foreground hover:bg-surface-subtle",
          className,
        )}
      >
        {label ?? t("verifyDialog.status.unsupported")}
        {modeContent}
      </Badge>
    )
  }

  if (status === API_VERIFICATION_HISTORY_STATUSES.Unverified) {
    return (
      <Badge variant="outline" size="sm" className={className}>
        {label ?? t("verifyDialog.status.unverified")}
        {modeContent}
      </Badge>
    )
  }

  return (
    <Badge variant="destructive" size="sm" className={className}>
      <span className="gap-y-density-1 flex items-center gap-x-1">
        <CircleX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label ?? t("verifyDialog.status.fail")}
      </span>
      {modeContent}
    </Badge>
  )
}
