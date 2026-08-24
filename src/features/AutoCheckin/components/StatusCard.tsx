import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardFooter } from "~/components/ui"
import {
  AUTO_CHECKIN_RUN_RESULT,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinRunResultLabel,
  type AutoCheckinPreferences,
  type AutoCheckinRunResult,
  type AutoCheckinStatus,
} from "~/types/autoCheckin"
import { formatLocaleDateTime } from "~/utils/core/formatters"

interface StatusCardProps {
  status: AutoCheckinStatus
  preferences: AutoCheckinPreferences
  actions?: ReactNode
}

/**
 * Shows aggregated auto-checkin status info (last run, next schedule, results summary).
 * @param props Component props container.
 * @param props.status Status payload from auto-checkin service.
 * @param props.preferences User preferences used to interpret missing schedules (disabled vs not scheduled).
 * @param props.actions Optional controls rendered in the card footer.
 */
export default function StatusCard({
  status,
  preferences,
  actions,
}: StatusCardProps) {
  const { t } = useTranslation("autoCheckin")

  // Backward compatibility: older status payloads only store `nextScheduledAt` (single-alarm model).
  const nextDailyScheduledAt =
    status.nextDailyScheduledAt ?? status.nextScheduledAt
  const nextRetryScheduledAt = status.nextRetryScheduledAt
  // Pending retry is derived from retry state; `pendingRetry` is kept for legacy stored payloads.
  const hasPendingRetry =
    status.pendingRetry ||
    (status.retryState?.pendingAccountIds?.length ?? 0) > 0
  const isRetryEnabled = Boolean(preferences.retryStrategy?.enabled)

  /**
   * Interprets "no alarm" situations:
   * - Daily schedule: show "disabled" when global auto check-in is turned off.
   * - Retry schedule: show "retry disabled" when retry is off; show "no pending retry" when retry is on but queue is empty.
   */
  const getNextDailyText = (): string => {
    if (!preferences.globalEnabled) return t("status.disabled")
    return formatLocaleDateTime(nextDailyScheduledAt, t("status.notScheduled"))
  }

  const getNextRetryText = (): string => {
    if (!isRetryEnabled) return t("status.retryDisabled")
    if (!hasPendingRetry) return t("status.noPendingRetry")
    return formatLocaleDateTime(nextRetryScheduledAt, t("status.notScheduled"))
  }

  const getResultBadgeColor = (result?: AutoCheckinRunResult): string => {
    switch (result) {
      case AUTO_CHECKIN_RUN_RESULT.SUCCESS:
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      case AUTO_CHECKIN_RUN_RESULT.PARTIAL:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
      case AUTO_CHECKIN_RUN_RESULT.FAILED:
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      case AUTO_CHECKIN_RUN_RESULT.SKIPPED:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
    }
  }

  const accountResults = status.perAccount
    ? Object.values(status.perAccount)
    : []
  const derivedSuccess = accountResults.filter(
    (r) =>
      r.status === CHECKIN_RESULT_STATUS.SUCCESS ||
      r.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ).length
  const derivedFailed = accountResults.filter(
    (r) => r.status === CHECKIN_RESULT_STATUS.FAILED,
  ).length
  const derivedSkipped = accountResults.length - derivedSuccess - derivedFailed

  const summary = status.summary ?? {
    totalEligible: accountResults.length,
    executed: accountResults.length,
    successCount: derivedSuccess,
    failedCount: derivedFailed,
    skippedCount: Math.max(derivedSkipped, 0),
    needsRetry: false,
  }

  const summaryItems = [
    {
      label: t("status.summary.eligible"),
      value: summary.totalEligible ?? accountResults.length,
    },
    {
      label: t("status.summary.executed"),
      value: summary.executed ?? accountResults.length,
    },
    {
      label: t("status.summary.success"),
      value: summary.successCount ?? derivedSuccess,
    },
    {
      label: t("status.summary.failed"),
      value: summary.failedCount ?? derivedFailed,
    },
    {
      label: t("status.summary.skipped"),
      value: summary.skippedCount ?? derivedSkipped,
    },
  ]

  return (
    <Card>
      <CardContent className="space-y-4" padding="md">
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("status.lastRun")}
            </div>
            <div className="mt-1 text-base font-semibold">
              {formatLocaleDateTime(status.lastRunAt, t("status.notScheduled"))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("status.nextDaily")}
            </div>
            <div className="mt-1 text-base font-semibold">
              {getNextDailyText()}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("status.nextRetry")}
            </div>
            <div className="mt-1 text-base font-semibold">
              {getNextRetryText()}
              {hasPendingRetry && isRetryEnabled && (
                <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                  {t("status.pendingRetry")}
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("execution.statistics.result")}
            </div>
            <div className="mt-1">
              {status.lastRunResult && (
                <span
                  className={`inline-block rounded px-2 py-1 text-sm font-medium ${getResultBadgeColor(status.lastRunResult)}`}
                >
                  {getAutoCheckinRunResultLabel(t, status.lastRunResult)}
                </span>
              )}
              {!status.lastRunResult && (
                <span className="text-lg font-semibold text-gray-400">-</span>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {t("status.summary.title")}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-gray-600 sm:grid-cols-3 lg:grid-cols-5 dark:text-gray-300">
            {summaryItems.map((item) => (
              <div key={item.label} className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </span>
                <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {item.value ?? "-"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      {actions ? (
        <CardFooter className="block px-4 py-3 sm:px-6" padding="none">
          {actions}
        </CardFooter>
      ) : null}
    </Card>
  )
}
