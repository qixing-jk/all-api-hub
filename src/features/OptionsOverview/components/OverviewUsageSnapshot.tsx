import type { TFunction } from "i18next"
import { BarChart3 } from "lucide-react"

import Tooltip from "~/components/Tooltip"
import { Card, WorkflowTransitionButton } from "~/components/ui"
import type { AccountMetricCoverage } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import {
  formatTokenCount,
  getTodayMetricPresentation,
} from "~/utils/core/formatters"

import type { OptionsOverviewUsageSnapshot } from "../types"
import { OverviewMetricTile } from "./OverviewMetricTile"
import { getUsagePercentShare } from "./usageSnapshotMath"

interface OverviewUsageSnapshotProps {
  snapshot: OptionsOverviewUsageSnapshot
  t: TFunction
  onNavigate: (target: OptionsOverviewUsageSnapshot["target"]) => void
}

/**
 * Renders today's and recent request/token aggregates.
 */
export function OverviewUsageSnapshot({
  snapshot,
  t,
  onNavigate,
}: OverviewUsageSnapshotProps) {
  if (!snapshot.hasUsageData) {
    return (
      <Card className="dark:from-dark-bg-secondary overflow-hidden border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/70 shadow-sm shadow-blue-100/60 dark:border-white/10 dark:bg-gradient-to-br dark:via-slate-900/90 dark:to-blue-950/10 dark:shadow-black/20">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white/80 text-blue-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-blue-300">
              <BarChart3 className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-950 dark:text-white">
                {t("optionsOverview:usage.empty.title")}
              </div>
              <div className="dark:text-dark-text-secondary mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                {t("optionsOverview:usage.empty.description")}
              </div>
            </div>
          </div>

          <WorkflowTransitionButton
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => onNavigate(snapshot.target)}
          >
            {t("optionsOverview:actions.open")}
          </WorkflowTransitionButton>
        </div>
      </Card>
    )
  }

  const todayRequestShare = getUsagePercentShare(
    snapshot.todayRequests,
    snapshot.sevenDayRequests,
    {
      todayCoverage: snapshot.todayRequestsCoverage,
      hasTotalData: snapshot.hasSevenDayUsageData,
    },
  )
  const todayTokenShare = getUsagePercentShare(
    snapshot.todayTokens,
    snapshot.sevenDayTokens,
    {
      todayCoverage: snapshot.todayTokensCoverage,
      hasTotalData: snapshot.hasSevenDayUsageData,
    },
  )

  return (
    <Card className="dark:from-dark-bg-secondary overflow-hidden border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/70 shadow-sm shadow-blue-100/60 dark:border-white/10 dark:bg-gradient-to-br dark:via-slate-900/90 dark:to-blue-950/10 dark:shadow-black/20">
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(12rem,0.85fr)_minmax(0,1.5fr)_minmax(14rem,1fr)] lg:items-stretch">
        <div className="flex min-w-0 flex-col justify-between gap-5">
          <div>
            <div className="dark:text-dark-text-tertiary text-xs font-medium text-gray-500 uppercase">
              {t("optionsOverview:usage.todayCost")}
            </div>
            <div className="mt-2 min-w-0 text-3xl leading-tight font-semibold break-words text-gray-950 dark:text-white">
              <AvailabilityAwareValue
                value={snapshot.todayCostText}
                coverage={snapshot.todayCostCoverage}
                t={t}
              />
            </div>
          </div>
          <WorkflowTransitionButton
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => onNavigate(snapshot.target)}
          >
            {t("optionsOverview:actions.open")}
          </WorkflowTransitionButton>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TodayUsageMetric
            label={t("optionsOverview:usage.todayRequests")}
            value={snapshot.todayRequests}
            coverage={snapshot.todayRequestsCoverage}
            t={t}
          />
          <TodayUsageMetric
            label={t("optionsOverview:usage.todayTokens")}
            value={snapshot.todayTokens}
            coverage={snapshot.todayTokensCoverage}
            t={t}
          />
          <UsageMetric
            label={t("optionsOverview:usage.sevenDayRequests")}
            value={snapshot.sevenDayRequests}
          />
          <UsageMetric
            label={t("optionsOverview:usage.sevenDayTokens")}
            value={snapshot.sevenDayTokens}
          />
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 rounded-lg border border-blue-100/70 bg-white/65 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div>
            <div className="dark:text-dark-text-secondary text-sm font-semibold text-slate-900 dark:text-white">
              {t("optionsOverview:usage.activityMix")}
            </div>
            <div className="dark:text-dark-text-tertiary mt-1 text-xs leading-5 text-slate-500">
              {snapshot.hasSevenDayUsageData
                ? t("optionsOverview:usage.todayShare")
                : t("optionsOverview:usage.noRecentActivity")}
            </div>
          </div>
          <UsageShare
            label={t("optionsOverview:usage.requestShare")}
            value={todayRequestShare}
            coverage={snapshot.todayRequestsCoverage}
            t={t}
          />
          <UsageShare
            label={t("optionsOverview:usage.tokenShare")}
            value={todayTokenShare}
            coverage={snapshot.todayTokensCoverage}
            t={t}
          />
        </div>
      </div>
    </Card>
  )
}

/** Renders one today metric while preserving its aggregate coverage state. */
function TodayUsageMetric({
  label,
  value,
  coverage,
  t,
}: {
  label: string
  value: number
  coverage: AccountMetricCoverage
  t: TFunction
}) {
  const presentation = getTodayMetricPresentation(value, coverage)

  return (
    <OverviewMetricTile
      label={label}
      value={
        <AvailabilityAwareValue
          value={
            presentation.value === null
              ? null
              : formatTokenCount(presentation.value)
          }
          coverage={coverage}
          t={t}
        />
      }
      className="border-blue-100/60 bg-white/70 p-3 dark:bg-white/[0.03]"
      labelClassName="text-gray-500"
      valueClassName="text-lg leading-normal text-gray-950"
    />
  )
}

/** Renders a value, partial qualifier, or unavailable marker from coverage. */
function AvailabilityAwareValue({
  value,
  coverage,
  t,
}: {
  value: string | null
  coverage: AccountMetricCoverage
  t: TFunction
}) {
  if (coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable) {
    const unavailableLabel = t(
      coverage.legacyUnclassifiedCount > 0
        ? "optionsOverview:todayMetricAvailability.pendingRefreshHelp"
        : "optionsOverview:todayMetricAvailability.unavailable",
    )
    if (coverage.legacyUnclassifiedCount > 0) {
      return (
        <Tooltip
          content={unavailableLabel}
          wrapperClassName="min-w-0 justify-start"
        >
          <span
            aria-label={unavailableLabel}
            className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            tabIndex={0}
          >
            <span aria-hidden="true">
              {t("optionsOverview:todayMetricAvailability.pendingRefresh")}
            </span>
          </span>
        </Tooltip>
      )
    }
    return (
      <span aria-label={unavailableLabel}>
        <span aria-hidden="true">—</span>
      </span>
    )
  }

  if (coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial) {
    const partialLabel = t("optionsOverview:todayMetricAvailability.partial")
    const qualifier =
      coverage.legacyUnclassifiedCount > 0
        ? t("optionsOverview:todayMetricAvailability.includesPendingRefresh")
        : undefined
    const coverageLabel = t(
      coverage.legacyUnclassifiedCount > 0
        ? "optionsOverview:todayMetricAvailability.coverageWithRefresh"
        : "optionsOverview:todayMetricAvailability.coverage",
      {
        complete: coverage.completeCount,
        partial: coverage.partialCount,
        refresh: coverage.legacyUnclassifiedCount,
        eligible: coverage.eligibleCount,
      },
    )
    return (
      <Tooltip content={coverageLabel} wrapperClassName="min-w-0 justify-start">
        <span
          aria-label={[value, qualifier ?? partialLabel, coverageLabel]
            .filter(Boolean)
            .join(". ")}
          className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          tabIndex={0}
        >
          {value}
          {qualifier ? (
            <span className="dark:text-dark-text-tertiary ml-1.5 text-[10px] font-medium text-gray-500">
              {qualifier}
            </span>
          ) : null}
        </span>
      </Tooltip>
    )
  }

  return value
}

/**
 * Renders one numeric usage metric with compact formatting.
 */
function UsageMetric({ label, value }: { label: string; value: number }) {
  return (
    <OverviewMetricTile
      label={label}
      value={formatTokenCount(value)}
      className="border-blue-100/60 bg-white/70 p-3 dark:bg-white/[0.03]"
      labelClassName="text-gray-500"
      valueClassName="dark:text-dark-text-secondary text-base leading-normal text-gray-700"
    />
  )
}

/**
 * Renders a bounded today-vs-7-day share indicator.
 */
function UsageShare({
  label,
  value,
  coverage,
  t,
}: {
  label: string
  value: number | null
  coverage: AccountMetricCoverage
  t: TFunction
}) {
  const pendingRefreshLabel = t(
    "optionsOverview:todayMetricAvailability.pendingRefresh",
  )
  const unavailableLabel = t(
    coverage.legacyUnclassifiedCount > 0
      ? "optionsOverview:todayMetricAvailability.pendingRefreshHelp"
      : "optionsOverview:todayMetricAvailability.unavailable",
  )
  const unavailableValue = (
    <span
      aria-label={
        coverage.legacyUnclassifiedCount > 0
          ? pendingRefreshLabel
          : unavailableLabel
      }
      className={
        coverage.legacyUnclassifiedCount > 0
          ? "cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          : undefined
      }
      tabIndex={coverage.legacyUnclassifiedCount > 0 ? 0 : undefined}
    >
      <span aria-hidden="true">
        {coverage.legacyUnclassifiedCount > 0 ? pendingRefreshLabel : "—"}
      </span>
    </span>
  )
  const formattedValue = value === null ? undefined : `${value}%`
  const isLegacyPartial =
    value !== null &&
    coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial &&
    coverage.legacyUnclassifiedCount > 0
  const qualifier = isLegacyPartial
    ? t("optionsOverview:todayMetricAvailability.includesPendingRefresh")
    : undefined
  const coverageLabel = isLegacyPartial
    ? t("optionsOverview:todayMetricAvailability.coverageWithRefresh", {
        complete: coverage.completeCount,
        partial: coverage.partialCount,
        refresh: coverage.legacyUnclassifiedCount,
        eligible: coverage.eligibleCount,
      })
    : undefined
  const availableValue =
    formattedValue && qualifier && coverageLabel ? (
      <Tooltip content={coverageLabel} anchorAsChild>
        <span
          aria-label={`${formattedValue}. ${qualifier}`}
          className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          tabIndex={0}
        >
          <span aria-hidden="true">{formattedValue}</span>{" "}
          <span
            aria-hidden="true"
            className="dark:text-dark-text-tertiary text-[10px] font-medium text-slate-500"
          >
            {qualifier}
          </span>
        </span>
      </Tooltip>
    ) : (
      formattedValue
    )
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="dark:text-dark-text-tertiary text-xs font-medium text-slate-500">
          {label}
        </span>
        <span className="dark:text-dark-text-secondary text-xs font-semibold text-slate-700">
          {value === null ? (
            coverage.legacyUnclassifiedCount > 0 ? (
              <Tooltip content={unavailableLabel} anchorAsChild>
                {unavailableValue}
              </Tooltip>
            ) : (
              unavailableValue
            )
          ) : (
            availableValue
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-white/10">
        {value === null ? null : (
          <div
            className="h-full rounded-full bg-blue-500 dark:bg-blue-500"
            style={{ width: `${value}%` }}
          />
        )}
      </div>
    </div>
  )
}
