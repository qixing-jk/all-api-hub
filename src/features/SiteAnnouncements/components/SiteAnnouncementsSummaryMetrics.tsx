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
            className="border-border bg-card dark:border-foreground/10 rounded-lg border p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs font-medium">
                  {metric.label}
                </p>
                <p className="text-foreground mt-1 text-2xl font-semibold">
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
