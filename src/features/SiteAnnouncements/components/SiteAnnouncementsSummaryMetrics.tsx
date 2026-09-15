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
    <div className="mb-density-5 gap-y-density-3 grid gap-x-3 sm:grid-cols-3">
      {metrics.map((metric) => {
        const Icon = metric.icon

        return (
          <div
            key={metric.key}
            className="border-border bg-card dark:border-foreground/10 py-density-4 rounded-lg border px-4 shadow-sm"
          >
            <div className="gap-y-density-3 flex items-center justify-between gap-x-3">
              <div>
                <p className="text-muted-foreground text-xs font-medium">
                  {metric.label}
                </p>
                <p className="text-foreground mt-density-1 text-2xl font-semibold">
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
