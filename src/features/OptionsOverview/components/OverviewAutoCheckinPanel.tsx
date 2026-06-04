import type { TFunction } from "i18next"
import { CalendarClock, RotateCcw } from "lucide-react"

import { Badge, Button, Card, WorkflowTransitionButton } from "~/components/ui"
import { cn } from "~/lib/utils"

import { OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES as AUTO_CHECKIN_PANEL_STATUSES } from "../ids"
import type { OptionsOverviewAutoCheckinPanel } from "../types"
import {
  getAutoCheckinActionLabel,
  getAutoCheckinEmptyDescription,
  getAutoCheckinStatusLabel,
} from "./autoCheckinPanelText"
import { OverviewMetricTile } from "./OverviewMetricTile"
import {
  AUTO_CHECKIN_STATUS_BADGE_VARIANTS,
  OVERVIEW_NEUTRAL_PANEL_CLASSES,
} from "./overviewPresentation"

interface OverviewAutoCheckinPanelProps {
  panel: OptionsOverviewAutoCheckinPanel
  t: TFunction
  onNavigate: (
    target: OptionsOverviewAutoCheckinPanel["actions"][number]["target"],
  ) => void
  embedded?: boolean
}

/**
 * Renders the high-priority auto check-in operational summary.
 */
export function OverviewAutoCheckinPanel({
  panel,
  t,
  onNavigate,
  embedded = false,
}: OverviewAutoCheckinPanelProps) {
  const primaryAction = panel.actions[0]
  const secondaryActions = panel.actions.slice(1)
  const content = (
    <>
      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Badge
              variant={AUTO_CHECKIN_STATUS_BADGE_VARIANTS[panel.status]}
              size="sm"
            >
              {getAutoCheckinStatusLabel(panel.status, t)}
            </Badge>
            <div className="text-xl font-semibold text-slate-950 dark:text-white">
              {panel.successCount}/{panel.totalEligible}
            </div>
            <div className="dark:text-dark-text-secondary text-sm leading-6 text-slate-600">
              {t("optionsOverview:autoCheckin.summary")}
            </div>
            {panel.status === AUTO_CHECKIN_PANEL_STATUSES.notRun ||
            panel.status === AUTO_CHECKIN_PANEL_STATUSES.disabled ? (
              <div className="dark:text-dark-text-tertiary text-sm leading-6 text-slate-500">
                {getAutoCheckinEmptyDescription(panel.status, t)}
              </div>
            ) : null}
          </div>
          <CalendarClock className="h-5 w-5 shrink-0 text-slate-400 dark:text-gray-500" />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <OverviewMetricTile
            label={t("optionsOverview:autoCheckin.metrics.success")}
            value={panel.successCount}
          />
          <OverviewMetricTile
            label={t("optionsOverview:autoCheckin.metrics.failed")}
            value={panel.failedCount}
          />
          <OverviewMetricTile
            label={t("optionsOverview:autoCheckin.metrics.skipped")}
            value={panel.skippedCount}
          />
        </div>

        <div className="dark:text-dark-text-tertiary space-y-1 text-xs text-slate-500">
          <TimeLine
            label={t("optionsOverview:autoCheckin.lastRun")}
            value={panel.lastRunAt}
            fallback={t("optionsOverview:autoCheckin.notRunYet")}
          />
          <TimeLine
            label={t("optionsOverview:autoCheckin.nextRun")}
            value={panel.nextRunAt}
            fallback={t("optionsOverview:autoCheckin.notScheduled")}
          />
          {panel.nextRetryAt ? (
            <TimeLine
              label={t("optionsOverview:autoCheckin.nextRetry")}
              value={panel.nextRetryAt}
              fallback={t("optionsOverview:autoCheckin.notScheduled")}
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200/70 bg-slate-50/70 p-4 sm:flex-row dark:border-white/10 dark:bg-white/[0.03]">
        {primaryAction ? (
          <WorkflowTransitionButton
            type="button"
            size="sm"
            className="sm:flex-1"
            onClick={() => onNavigate(primaryAction.target)}
          >
            {getAutoCheckinActionLabel(primaryAction.id, t)}
          </WorkflowTransitionButton>
        ) : null}
        {secondaryActions.map((action) => (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant="outline"
            className="sm:flex-1"
            onClick={() => onNavigate(action.target)}
            leftIcon={<RotateCcw className="h-4 w-4" />}
          >
            {getAutoCheckinActionLabel(action.id, t)}
          </Button>
        ))}
      </div>
    </>
  )

  if (embedded) {
    return (
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-lg border",
          OVERVIEW_NEUTRAL_PANEL_CLASSES,
        )}
      >
        {content}
      </div>
    )
  }

  return (
    <Card
      className={cn(
        "flex h-full flex-col overflow-hidden shadow-sm",
        OVERVIEW_NEUTRAL_PANEL_CLASSES,
      )}
    >
      {content}
    </Card>
  )
}

/**
 * Renders a single scheduled or historical run time row.
 */
function TimeLine({
  label,
  value,
  fallback,
}: {
  label: string
  value?: string
  fallback: string
}) {
  return (
    <div className="flex min-w-0 justify-between gap-3">
      <span className="shrink-0">{label}</span>
      <span className="truncate font-medium text-slate-700 dark:text-gray-300">
        {value ? new Date(value).toLocaleString() : fallback}
      </span>
    </div>
  )
}
