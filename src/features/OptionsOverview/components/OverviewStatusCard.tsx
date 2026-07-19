import type { TFunction } from "i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import Tooltip from "~/components/Tooltip"
import { Button, Card } from "~/components/ui"
import { cn } from "~/lib/utils"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"

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
  const coverageLabel = getCoverageLabel(item, t)
  const isStaticCoverageValue =
    !item.target &&
    (item.coverage?.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial ||
      (item.coverage?.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
        item.coverage.legacyUnclassifiedCount > 0))
  const accessibleValue = getAccessibleStatusValue(item, t)
  const visibleQualifier = getVisibleStatusQualifier(item, t)

  const metric = item.target ? (
    <Button
      type="button"
      variant="ghost"
      className="group block h-full w-full min-w-0 rounded-none px-0 py-0 text-left whitespace-normal transition-colors hover:bg-slate-50/85 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset dark:hover:bg-white/[0.04]"
      onClick={() => onNavigate(item.target!)}
      aria-label={[
        getStatusCardLabel(item.id, t),
        accessibleValue,
        visibleQualifier,
        coverageLabel,
      ]
        .filter(Boolean)
        .join(". ")}
    >
      <StatusMetricContent item={item} t={t} coverageLabel={coverageLabel} />
    </Button>
  ) : (
    <StatusMetricContent
      item={item}
      t={t}
      coverageLabel={coverageLabel}
      focusableValue={isStaticCoverageValue}
    />
  )

  const showsCoverageTooltip =
    item.coverage?.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial ||
    (item.coverage?.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
      item.coverage.legacyUnclassifiedCount > 0)

  return coverageLabel && showsCoverageTooltip ? (
    <Tooltip
      content={coverageLabel}
      wrapperClassName="h-full w-full min-w-0 justify-start"
    >
      {metric}
    </Tooltip>
  ) : (
    metric
  )
}

/**
 * Renders the visual content shared by static and navigable status metrics.
 */
function StatusMetricContent({
  item,
  t,
  coverageLabel,
  focusableValue = false,
}: {
  item: OptionsOverviewStatusCard
  t: TFunction
  coverageLabel?: string
  focusableValue?: boolean
}) {
  const label = getStatusCardLabel(item.id, t)
  const visibleValue = getVisibleStatusValue(item, t)
  const visibleQualifier = getVisibleStatusQualifier(item, t)
  const accessibleLabel =
    focusableValue &&
    item.coverage?.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial
      ? [visibleValue, visibleQualifier, coverageLabel]
          .filter(Boolean)
          .join(". ")
      : coverageLabel
  const value = (
    <span
      className={cn(
        "text-base leading-none font-semibold text-slate-950 dark:text-white",
        focusableValue &&
          "cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
      )}
      aria-label={accessibleLabel}
      tabIndex={focusableValue ? 0 : undefined}
    >
      <span aria-hidden={Boolean(coverageLabel)}>{visibleValue}</span>
      {visibleQualifier ? (
        <span
          aria-hidden="true"
          className="dark:text-dark-text-tertiary ml-1.5 text-[10px] font-medium text-slate-500"
        >
          {visibleQualifier}
        </span>
      ) : null}
    </span>
  )

  return (
    <div className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3">
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
          <div className="mt-1 flex items-baseline gap-1.5">{value}</div>
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

/** Resolves the localized qualifier for a status card's optional coverage. */
function getCoverageLabel(item: OptionsOverviewStatusCard, t: TFunction) {
  if (!item.coverage) return undefined

  if (item.coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable) {
    return t(
      item.coverage.legacyUnclassifiedCount > 0
        ? "optionsOverview:todayMetricAvailability.pendingRefreshHelp"
        : "optionsOverview:todayMetricAvailability.unavailable",
    )
  }
  if (item.coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial) {
    return t(
      item.coverage.legacyUnclassifiedCount > 0
        ? "optionsOverview:todayMetricAvailability.coverageWithRefresh"
        : "optionsOverview:todayMetricAvailability.coverage",
      {
        complete: item.coverage.completeCount,
        partial: item.coverage.partialCount,
        refresh: item.coverage.legacyUnclassifiedCount,
        eligible: item.coverage.eligibleCount,
      },
    )
  }
  return undefined
}

/** Returns the visible value or pending-refresh status for a summary card. */
function getVisibleStatusValue(item: OptionsOverviewStatusCard, t: TFunction) {
  return item.coverage?.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
    item.coverage.legacyUnclassifiedCount > 0
    ? t("optionsOverview:todayMetricAvailability.pendingRefresh")
    : item.value
}

/** Omits visual unavailable placeholders from the card's accessible name. */
function getAccessibleStatusValue(
  item: OptionsOverviewStatusCard,
  t: TFunction,
) {
  return item.coverage?.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
    item.coverage.legacyUnclassifiedCount === 0
    ? undefined
    : getVisibleStatusValue(item, t)
}

/** Returns the compact qualifier for partial legacy coverage. */
function getVisibleStatusQualifier(
  item: OptionsOverviewStatusCard,
  t: TFunction,
) {
  return item.coverage?.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial &&
    item.coverage.legacyUnclassifiedCount > 0
    ? t("optionsOverview:todayMetricAvailability.includesPendingRefresh")
    : undefined
}
