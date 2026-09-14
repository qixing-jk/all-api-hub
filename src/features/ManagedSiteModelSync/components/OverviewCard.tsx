import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { Button, Card, CardContent } from "~/components/ui"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"
import { formatFullTime } from "~/utils/core/formatters"

interface OverviewCardProps {
  enabled: boolean
  intervalMs?: number
  nextScheduledAt?: string | number | null
  lastRunAt?: number | string | null
  onConfigureAutoSync?: () => void
  configureAutoSyncAnalyticsAction?: ProductAnalyticsScopedActionConfig
}

/**
 * Convert an interval (ms) into a short, localized cadence label (e.g. Every 2h).
 */
const formatInterval = (t: TFunction, ms?: number) => {
  if (!ms || ms <= 0) return "-"
  const minutes = Math.round(ms / 1000 / 60)
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return t("managedSiteModelSync:execution.overview.everyHours", {
      count: hours,
    })
  }
  return t("managedSiteModelSync:execution.overview.everyMinutes", {
    count: minutes,
  })
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
  const {
    enabled,
    intervalMs,
    nextScheduledAt,
    lastRunAt,
    onConfigureAutoSync,
    configureAutoSyncAnalyticsAction,
  } = props
  const { t } = useTranslation("managedSiteModelSync")

  return (
    <Card>
      <CardContent padding="md">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-sm font-medium">
              {t("execution.overview.autoSync")}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {enabled ? (
                <span className="bg-success-soft text-success-soft-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
                  {t("execution.overview.enabled")}
                </span>
              ) : (
                <span className="bg-muted text-secondary-foreground dark:bg-secondary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
                  {t("execution.overview.disabled")}
                </span>
              )}
              <span className="text-muted-foreground dark:text-secondary-foreground ml-2 text-sm font-medium">
                {formatInterval(t, intervalMs)}
              </span>
            </div>
          </div>

          <div>
            <div className="text-muted-foreground text-sm font-medium">
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
            <div className="text-muted-foreground text-sm font-medium">
              {t("execution.overview.lastRun")}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {formatIsoOrFallback(lastRunAt, t("execution.overview.never"))}
            </div>
          </div>
        </div>

        {!enabled && onConfigureAutoSync ? (
          <div className="border-border bg-surface-subtle dark:bg-card/60 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground dark:text-secondary-foreground text-sm">
              {t("execution.overview.disabledHint")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              analyticsAction={configureAutoSyncAnalyticsAction}
              onClick={onConfigureAutoSync}
            >
              {t("execution.overview.enableAutoSync")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
