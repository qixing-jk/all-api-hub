import { useTranslation } from "react-i18next"

import { VerificationStatusBadge } from "~/features/Verification/api/VerificationStatusBadge"
import {
  API_VERIFICATION_HISTORY_STATUSES,
  getVerificationSummaryLatencyMs,
  type ApiVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"
import { formatFullTime, formatRelativeTime } from "~/utils/core/formatters"

export type VerificationHistorySummaryProps = {
  summary?: ApiVerificationHistorySummary | null
  className?: string
  hideTimestamp?: boolean
}

/**
 * Compact verification history summary that avoids repeating equivalent
 * "last verified / unverified" copy next to the status badge.
 * Formats relative time (e.g. "5 minutes ago") with absolute time in tooltip.
 */
export function VerificationHistorySummary({
  summary,
  className,
  hideTimestamp = false,
}: VerificationHistorySummaryProps) {
  const { t } = useTranslation("aiApiVerification")
  const latencyMs = getVerificationSummaryLatencyMs(summary)
  const date = summary?.verifiedAt ? new Date(summary.verifiedAt) : undefined
  const relativeTimestamp = date ? formatRelativeTime(date) : null
  const fullTimestamp = date ? formatFullTime(date) : undefined
  const verificationTimestampIso = date ? date.toISOString() : undefined

  return (
    <div
      className={
        className ??
        "gap-y-density-1-5 sm:gap-y-density-2 flex min-w-0 flex-wrap items-center gap-x-1.5 sm:gap-x-2"
      }
    >
      <span className="sr-only">{t("verifyDialog.history.lastVerified")}</span>
      <VerificationStatusBadge
        status={summary?.status ?? API_VERIFICATION_HISTORY_STATUSES.Unverified}
        latencyMs={latencyMs}
      />
      {!hideTimestamp && relativeTimestamp ? (
        <span className="gap-y-density-1-5 inline-flex min-w-0 items-center gap-x-1.5">
          <span
            aria-hidden="true"
            className="bg-surface-strong h-1 w-1 shrink-0 rounded-full"
          />
          <time
            dateTime={verificationTimestampIso}
            title={fullTimestamp}
            className="text-muted-foreground text-2xs cursor-default truncate sm:text-xs"
          >
            {relativeTimestamp}
          </time>
        </span>
      ) : null}
    </div>
  )
}
