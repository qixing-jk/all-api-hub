import type { TFunction } from "i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, Card } from "~/components/ui"
import { cn } from "~/lib/utils"

import type { OptionsOverviewStatusCard } from "../types"
import { getStatusCardDescription, getStatusCardLabel } from "./statusCardText"

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
 * Renders the top aggregate metrics as one anchored status surface.
 */
export function OverviewStatusSummary({
  items,
  t,
  onNavigate,
  "data-testid": dataTestId,
}: OverviewStatusSummaryProps) {
  return (
    <Card
      className="dark:from-dark-bg-secondary overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-slate-50/90 to-blue-50/60 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-gradient-to-br dark:via-slate-900/90 dark:to-blue-950/15 dark:shadow-black/20"
      data-testid={dataTestId}
    >
      <div className="grid grid-cols-1 divide-y divide-slate-200/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4 dark:divide-white/10">
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
      className="group block h-full min-w-0 rounded-none px-0 py-0 text-left whitespace-normal transition-colors hover:bg-white/55 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset dark:hover:bg-white/[0.04]"
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
  const description = getStatusCardDescription(item.id, t)

  return (
    <div className="flex h-full min-h-32 items-start justify-between gap-4 p-5">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full shadow-[0_0_0_4px]",
              severityClasses[item.severity],
            )}
          />
          <div className="dark:text-dark-text-tertiary text-xs font-medium text-slate-500 uppercase">
            {label}
          </div>
        </div>
        <div className="text-3xl leading-none font-semibold text-slate-950 dark:text-white">
          {item.value}
        </div>
        <div className="dark:text-dark-text-secondary max-w-48 text-xs leading-5 text-slate-500">
          {description}
        </div>
      </div>
      {item.target ? (
        <WorkflowTransitionIcon
          aria-hidden="true"
          className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-blue-600 dark:text-gray-600 dark:group-hover:text-blue-300"
        />
      ) : null}
    </div>
  )
}
