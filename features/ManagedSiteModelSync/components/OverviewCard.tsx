import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import { formatFullTime } from "~/utils/formatters"

interface OverviewCardProps {
  enabled: boolean
  intervalMs?: number
  nextScheduledAt?: string | number | null
  lastRunAt?: number | string | null
}

/**
 * Convert an interval (ms) into a short, localized cadence label (e.g. Every 2h).
 */
const formatInterval = (
  t: (key: string, options?: any) => string,
  ms?: number,
) => {
  if (!ms || ms <= 0) return "-"
  const minutes = Math.round(ms / 1000 / 60)
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return t("execution.overview.everyHours", { count: hours })
  }
  return t("execution.overview.everyMinutes", { count: minutes })
}

/**
 * Format an ISO timestamp string to a consistent UI time, returning fallback when missing/invalid.
 */
const formatIsoOrFallback = (
  iso: number | string | null | undefined,
  fallback: string,
): string => {
  if (!iso) return fallback
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return fallback
    return formatFullTime(date)
  } catch {
    return fallback
  }
}

/**
 * Shows current scheduler state (enabled, next scheduled run) even when no execution history exists.
 */
export default function OverviewCard(props: OverviewCardProps) {
  const { enabled, intervalMs, nextScheduledAt, lastRunAt } = props
  const { t } = useTranslation("managedSiteModelSync")

  return (
    <Card>
      <CardContent padding="md">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("execution.overview.autoSync")}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {enabled ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
                  {t("execution.overview.enabled")}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                  {t("execution.overview.disabled")}
                </span>
              )}
              <span className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                {formatInterval(t, intervalMs)}
              </span>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("execution.statistics.nextRun")}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {enabled
                ? formatIsoOrFallback(
                    nextScheduledAt,
                    t("execution.statistics.notScheduled"),
                  )
                : t("execution.statistics.notScheduled")}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("execution.overview.lastRun")}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {formatIsoOrFallback(lastRunAt, t("execution.overview.never"))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
