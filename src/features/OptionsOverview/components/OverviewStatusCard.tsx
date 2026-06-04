import type { TFunction } from "i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, Card } from "~/components/ui"
import { cn } from "~/lib/utils"

import type { OptionsOverviewStatusCard } from "../types"
import { getStatusCardLabel } from "./statusCardText"

const severityClasses = {
  error: "bg-red-500 shadow-red-500/30",
  warning: "bg-amber-500 shadow-amber-500/30",
  info: "bg-blue-500 shadow-blue-500/30",
  success: "bg-emerald-500 shadow-emerald-500/30",
} as const

interface OverviewStatusSummaryProps {
  items: OptionsOverviewStatusCard[]
  t: TFunction
  onNavigate: (target: NonNullable<OptionsOverviewStatusCard["target"]>) => void
  "data-testid"?: string
}

/**
 * Renders aggregate metrics as a compact status and navigation strip.
 */
export function OverviewStatusSummary({
  items,
  t,
  onNavigate,
  "data-testid": dataTestId,
}: OverviewStatusSummaryProps) {
  return (
    <Card
      className="overflow-hidden border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-black/20"
      data-testid={dataTestId}
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200/70 md:grid-cols-4 md:divide-y-0 dark:divide-white/10">
        {items.map((item) => (
          <StatusMetric
            key={item.id}
            item={item}
            t={t}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </Card>
  )
}

interface StatusMetricProps {
  item: OptionsOverviewStatusCard
  t: TFunction
  onNavigate: (target: NonNullable<OptionsOverviewStatusCard["target"]>) => void
}

/**
 * Wraps navigable metrics in a full-cell button while keeping static metrics plain.
 */
function StatusMetric({ item, t, onNavigate }: StatusMetricProps) {
  if (!item.target) {
    return <StatusMetricContent item={item} t={t} />
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="group block h-full min-w-0 rounded-none px-0 py-0 text-left whitespace-normal transition-colors hover:bg-slate-50/85 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset dark:hover:bg-white/[0.04]"
      onClick={() => onNavigate(item.target!)}
    >
      <StatusMetricContent item={item} t={t} />
    </Button>
  )
}

/**
 * Renders the visual content shared by static and navigable status metrics.
 */
function StatusMetricContent({
  item,
  t,
}: {
  item: OptionsOverviewStatusCard
  t: TFunction
}) {
  const label = getStatusCardLabel(item.id, t)

  return (
    <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_4px]",
            severityClasses[item.severity],
          )}
        />
        <div className="min-w-0">
          <div className="dark:text-dark-text-tertiary truncate text-xs font-medium text-slate-500 uppercase">
            {label}
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-base leading-none font-semibold text-slate-950 dark:text-white">
              {item.value}
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.target ? (
          <WorkflowTransitionIcon
            aria-hidden="true"
            className="h-4 w-4 text-slate-300 transition-colors group-hover:text-blue-600 dark:text-gray-600 dark:group-hover:text-blue-300"
          />
        ) : null}
      </div>
    </div>
  )
}
