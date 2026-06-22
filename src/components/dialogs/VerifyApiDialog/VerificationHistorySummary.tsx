import { useTranslation } from "react-i18next"

import {
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
        className ?? "flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2"
      }
    >
      <span className="sr-only">{t("verifyDialog.history.lastVerified")}</span>
      <VerificationStatusBadge status={summary?.status ?? "unverified"} />
      {latencyMs !== null ? (
        <span className="dark:text-dark-text-tertiary truncate text-[11px] text-gray-500 sm:text-xs">
          {formatLatency(latencyMs)}
        </span>
      ) : null}
      {verificationTimestamp ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1 w-1 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600"
          />
          <time
            dateTime={verificationTimestampIso}
            title={t("verifyDialog.history.lastVerified")}
            className="dark:text-dark-text-tertiary truncate text-[11px] text-gray-500 sm:text-xs"
          >
            {verificationTimestamp}
          </time>
        </span>
      ) : null}
    </div>
  )
}
