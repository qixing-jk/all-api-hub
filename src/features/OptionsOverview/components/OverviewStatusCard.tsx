import type { TFunction } from "i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import Tooltip from "~/components/Tooltip"
import { Button, Card } from "~/components/ui"
import { cn } from "~/lib/utils"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"

import type { OptionsOverviewStatusCard } from "../types"
import { getStatusCardLabel } from "./statusCardText"

const severityClasses = {
  error: "bg-destructive shadow-destructive/30",
  warning: "bg-warning shadow-warning/30",
  info: "bg-info shadow-info/30",
  success: "bg-success shadow-success/30",
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
      className="border-border/80 bg-card/90 shadow-border/50 dark:border-foreground/10 dark:bg-foreground/[0.03] dark:shadow-shadow/20 overflow-hidden shadow-sm"
      data-testid={dataTestId}
    >
      <div className="divide-border/70 dark:divide-foreground/10 grid grid-cols-2 divide-x divide-y *:first:rounded-tl-[var(--corner-inner-radius)] *:last:rounded-br-[var(--corner-inner-radius)] *:nth-2:rounded-tr-[var(--corner-inner-radius)] *:nth-last-2:rounded-bl-[var(--corner-inner-radius)] md:grid-cols-4 md:divide-y-0 md:*:first:rounded-bl-[var(--corner-inner-radius)] md:*:last:rounded-tr-[var(--corner-inner-radius)] md:*:nth-2:rounded-tr-none md:*:nth-last-2:rounded-bl-none">
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
      className="group hover:bg-surface-subtle/85 focus-visible:ring-ring dark:hover:bg-foreground/[0.04] block h-full w-full min-w-0 rounded-none px-0 py-0 text-left whitespace-normal transition-colors focus-visible:ring-2 focus-visible:ring-inset"
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
      wrapperClassName="h-full w-full min-w-0 justify-start [&>button]:rounded-[inherit]"
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
        "text-foreground text-base leading-none font-semibold",
        focusableValue &&
          "focus-visible:ring-ring cursor-help rounded-sm outline-none focus-visible:ring-2",
      )}
      aria-label={accessibleLabel}
      tabIndex={focusableValue ? 0 : undefined}
    >
      <span aria-hidden={Boolean(coverageLabel)}>{visibleValue}</span>
      {visibleQualifier ? (
        <span
          aria-hidden="true"
          className="text-muted-foreground text-3xs ml-1.5 font-medium"
        >
          {visibleQualifier}
        </span>
      ) : null}
    </span>
  )

  return (
    <div className="gap-y-density-3 py-density-3 flex min-h-16 w-full items-center justify-between gap-x-3 px-4">
      <div className="gap-y-density-3-5 flex min-w-0 items-center gap-x-3.5">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_4px]",
            severityClasses[item.severity],
          )}
        />
        <div className="min-w-0">
          <div className="text-muted-foreground truncate text-xs font-medium uppercase">
            {label}
          </div>
          <div className="mt-density-1 gap-y-density-1-5 flex items-baseline gap-x-1.5">
            {value}
          </div>
        </div>
      </div>
      <div className="gap-y-density-2 flex shrink-0 items-center gap-x-2">
        {item.target ? (
          <WorkflowTransitionIcon
            aria-hidden="true"
            className="text-disabled-foreground group-hover:text-theme-600 dark:group-hover:text-theme-300 h-4 w-4 transition-colors"
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
