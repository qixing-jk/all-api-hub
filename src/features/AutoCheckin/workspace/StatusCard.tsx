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
        return "bg-success-soft text-success-soft-foreground"
      case AUTO_CHECKIN_RUN_RESULT.PARTIAL:
        return "bg-warning-soft text-warning-soft-foreground"
      case AUTO_CHECKIN_RUN_RESULT.FAILED:
        return "bg-destructive-soft text-destructive-soft-foreground"
      case AUTO_CHECKIN_RUN_RESULT.SKIPPED:
        return "bg-muted text-secondary-foreground dark:bg-card"
      default:
        return "bg-muted text-secondary-foreground dark:bg-secondary"
    }
  }

  const accountResults = status.perAccount
    ? Object.values(status.perAccount)
    : []
  const derivedSuccess = accountResults.filter(
    (r) => r.status === CHECKIN_RESULT_STATUS.SUCCESS,
  ).length
  const derivedAlreadyChecked = accountResults.filter(
    (r) => r.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ).length
  const derivedFailed = accountResults.filter(
    (r) => r.status === CHECKIN_RESULT_STATUS.FAILED,
  ).length
  const derivedUncertain = accountResults.filter(
    (r) => r.status === CHECKIN_RESULT_STATUS.UNCERTAIN,
  ).length
  const derivedSkipped =
    accountResults.length -
    derivedSuccess -
    derivedAlreadyChecked -
    derivedFailed -
    derivedUncertain

  const summary = status.summary ?? {
    totalEligible: accountResults.length,
    executed: accountResults.length,
    successCount: derivedSuccess,
    alreadyCheckedCount: derivedAlreadyChecked,
    failedCount: derivedFailed,
    uncertainCount: derivedUncertain,
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
      value:
        status.summary?.successCount == null
          ? derivedSuccess
          : Math.max(
              summary.successCount -
                (summary.alreadyCheckedCount ?? derivedAlreadyChecked),
              0,
            ),
    },
    {
      label: t("status.summary.alreadyChecked"),
      value: summary.alreadyCheckedCount ?? derivedAlreadyChecked,
    },
    {
      label: t("status.summary.failed"),
      value: summary.failedCount ?? derivedFailed,
    },
    {
      label: t("status.summary.uncertain"),
      value: summary.uncertainCount ?? derivedUncertain,
    },
    {
      label: t("status.summary.skipped"),
      value: summary.skippedCount ?? derivedSkipped,
    },
  ]

  return (
    <Card>
      <CardContent className="space-y-density-4" padding="md">
        <div className="gap-y-density-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-muted-foreground text-sm font-medium">
              {t("status.lastRun")}
            </div>
            <div className="mt-density-1 text-base font-semibold">
              {formatLocaleDateTime(status.lastRunAt, t("status.notScheduled"))}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground text-sm font-medium">
              {t("status.nextDaily")}
            </div>
            <div className="mt-density-1 text-base font-semibold">
              {getNextDailyText()}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground text-sm font-medium">
              {t("status.nextRetry")}
            </div>
            <div className="mt-density-1 text-base font-semibold">
              {getNextRetryText()}
              {hasPendingRetry && isRetryEnabled && (
                <span className="bg-warning-soft text-warning-soft-foreground ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
                  {t("status.pendingRetry")}
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground text-sm font-medium">
              {t("execution.statistics.result")}
            </div>
            <div className="mt-density-1">
              {status.lastRunResult && (
                <span
                  className={`py-density-1 inline-block rounded px-2 text-sm font-medium ${getResultBadgeColor(status.lastRunResult)}`}
                >
                  {getAutoCheckinRunResultLabel(t, status.lastRunResult)}
                </span>
              )}
              {!status.lastRunResult && (
                <span className="text-faint-foreground text-lg font-semibold">
                  -
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="border-border pt-density-4 border-t">
          <div className="text-muted-foreground text-sm font-medium">
            {t("status.summary.title")}
          </div>
          <div className="text-muted-foreground dark:text-secondary-foreground mt-density-2 gap-y-density-3 grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-3 lg:grid-cols-7">
            {summaryItems.map((item) => (
              <div key={item.label} className="flex flex-col">
                <span className="text-muted-foreground text-xs">
                  {item.label}
                </span>
                <span className="text-foreground text-base font-semibold">
                  {item.value ?? "-"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      {actions ? (
        <CardFooter className="py-density-3 block px-4 sm:px-6" padding="none">
          {actions}
        </CardFooter>
      ) : null}
    </Card>
  )
}
