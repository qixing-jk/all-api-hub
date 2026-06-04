import type { TFunction } from "i18next"
import { BarChart3 } from "lucide-react"

import { Card, WorkflowTransitionButton } from "~/components/ui"
import { formatTokenCount } from "~/utils/core/formatters"

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
  )
  const todayTokenShare = getUsagePercentShare(
    snapshot.todayTokens,
    snapshot.sevenDayTokens,
  )

  return (
    <Card className="dark:from-dark-bg-secondary overflow-hidden border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/70 shadow-sm shadow-blue-100/60 dark:border-white/10 dark:bg-gradient-to-br dark:via-slate-900/90 dark:to-blue-950/10 dark:shadow-black/20">
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(12rem,0.85fr)_minmax(0,1.5fr)_minmax(14rem,1fr)] lg:items-stretch">
        <div className="flex min-w-0 flex-col justify-between gap-5">
          <div>
            <div className="dark:text-dark-text-tertiary text-xs font-medium text-gray-500 uppercase">
              {t("optionsOverview:usage.todayCost")}
            </div>
            <div className="mt-2 truncate text-3xl font-semibold text-gray-950 dark:text-white">
              {snapshot.todayCostText}
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
          <UsageMetric
            label={t("optionsOverview:usage.todayRequests")}
            value={snapshot.todayRequests}
            tone="primary"
          />
          <UsageMetric
            label={t("optionsOverview:usage.todayTokens")}
            value={snapshot.todayTokens}
            tone="primary"
          />
          <UsageMetric
            label={t("optionsOverview:usage.sevenDayRequests")}
            value={snapshot.sevenDayRequests}
            tone="muted"
          />
          <UsageMetric
            label={t("optionsOverview:usage.sevenDayTokens")}
            value={snapshot.sevenDayTokens}
            tone="muted"
          />
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 rounded-lg border border-blue-100/70 bg-white/65 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div>
            <div className="dark:text-dark-text-secondary text-sm font-semibold text-slate-900 dark:text-white">
              {t("optionsOverview:usage.activityMix")}
            </div>
            <div className="dark:text-dark-text-tertiary mt-1 text-xs leading-5 text-slate-500">
              {snapshot.hasUsageData
                ? t("optionsOverview:usage.todayShare")
                : t("optionsOverview:usage.noRecentActivity")}
            </div>
          </div>
          <UsageShare
            label={t("optionsOverview:usage.requestShare")}
            value={todayRequestShare}
          />
          <UsageShare
            label={t("optionsOverview:usage.tokenShare")}
            value={todayTokenShare}
          />
        </div>
      </div>
    </Card>
  )
}

/**
 * Renders one numeric usage metric with compact formatting.
 */
function UsageMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "primary" | "muted"
}) {
  return (
    <OverviewMetricTile
      label={label}
      value={formatTokenCount(value)}
      className="border-blue-100/60 bg-white/70 p-3 dark:bg-white/[0.03]"
      labelClassName="text-gray-500"
      valueClassName={
        tone === "primary"
          ? "text-lg leading-normal text-gray-950"
          : "dark:text-dark-text-secondary text-base leading-normal text-gray-700"
      }
    />
  )
}

/**
 * Renders a bounded today-vs-7-day share indicator.
 */
function UsageShare({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="dark:text-dark-text-tertiary text-xs font-medium text-slate-500">
          {label}
        </span>
        <span className="dark:text-dark-text-secondary text-xs font-semibold text-slate-700">
          {value}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-blue-500 dark:bg-blue-500"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}
