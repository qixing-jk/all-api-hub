import { cn } from "~/lib/utils"

import type { AnnouncementMetric } from "../types"
import { getMetricToneClasses } from "../utils"

interface SiteAnnouncementsSummaryMetricsProps {
  metrics: AnnouncementMetric[]
}

/**
 * Displays the summary counters shown above the announcement list.
 */
export function SiteAnnouncementsSummaryMetrics({
  metrics,
}: SiteAnnouncementsSummaryMetricsProps) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      {metrics.map((metric) => {
        const Icon = metric.icon

        return (
          <div
            key={metric.key}
            className="dark:bg-dark-bg-secondary rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="dark:text-dark-text-tertiary text-xs font-medium text-gray-500">
                  {metric.label}
                </p>
                <p className="dark:text-dark-text-primary mt-1 text-2xl font-semibold text-gray-900">
                  {metric.value}
                </p>
              </div>
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md ring-1",
                  getMetricToneClasses(metric.tone),
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
