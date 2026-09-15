import { useTranslation } from "react-i18next"

import {
  API_VERIFICATION_HISTORY_STATUSES,
  getVerificationSummaryLatencyMs,
  type ApiVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"
import { formatLocaleDateTime } from "~/utils/core/formatters"

import { formatLatency } from "./utils"
import { VerificationStatusBadge } from "./VerificationStatusBadge"

type VerificationHistorySummaryProps = {
  summary?: ApiVerificationHistorySummary | null
  className?: string
}

/**
 * Compact verification history summary that avoids repeating equivalent
 * "last verified / unverified" copy next to the status badge.
 */
export function VerificationHistorySummary({
  summary,
  className,
}: VerificationHistorySummaryProps) {
  const { t } = useTranslation("aiApiVerification")
  const verificationTimestamp = summary
    ? formatLocaleDateTime(summary.verifiedAt)
    : null
  const verificationTimestampIso = summary
    ? new Date(summary.verifiedAt).toISOString()
    : undefined
  const latencyMs = getVerificationSummaryLatencyMs(summary)

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
      />
      {latencyMs !== null ? (
        <span className="text-muted-foreground truncate text-[11px] sm:text-xs">
          {formatLatency(latencyMs)}
        </span>
      ) : null}
      {verificationTimestamp ? (
        <span className="gap-y-density-1-5 inline-flex min-w-0 items-center gap-x-1.5">
          <span
            aria-hidden="true"
            className="bg-surface-strong h-1 w-1 shrink-0 rounded-full"
          />
          <time
            dateTime={verificationTimestampIso}
            title={t("verifyDialog.history.lastVerified")}
            className="text-muted-foreground truncate text-[11px] sm:text-xs"
          >
            {verificationTimestamp}
          </time>
        </span>
      ) : null}
    </div>
  )
}
