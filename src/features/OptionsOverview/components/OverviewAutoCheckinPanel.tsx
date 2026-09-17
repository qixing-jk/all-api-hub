import type { TFunction } from "i18next"
import { RotateCcw } from "lucide-react"

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
  const isDisabled = panel.status === AUTO_CHECKIN_PANEL_STATUSES.disabled
  const isNotRun = panel.status === AUTO_CHECKIN_PANEL_STATUSES.notRun
  const isEmptyState = isDisabled || isNotRun
  const emptyDescription = isEmptyState
    ? getAutoCheckinEmptyDescription(panel.status, t)
    : ""
  const actionsRow = (
    <div
      className={cn(
        "gap-y-density-2 flex flex-col gap-x-2",
        embedded
          ? ""
          : "border-border/70 bg-surface-subtle/70 dark:border-foreground/10 dark:bg-foreground/[0.03] py-density-4 border-t px-4 sm:flex-row",
      )}
    >
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
  )

  const content = isEmptyState ? (
    <>
      <div
        className={cn(
          "space-y-density-2",
          embedded ? "py-density-2" : "py-density-5 px-5",
        )}
      >
        <p className="text-muted-foreground text-sm leading-6">
          {emptyDescription}
        </p>
        {panel.nextRunAt ? (
          <TimeLine
            label={t("optionsOverview:autoCheckin.nextRun")}
            value={panel.nextRunAt}
            fallback={t("optionsOverview:autoCheckin.notScheduled")}
          />
        ) : null}
      </div>
      {actionsRow}
    </>
  ) : (
    <>
      <div
        className={cn(
          "gap-y-density-4 flex flex-1 flex-col",
          embedded ? "py-density-2" : "py-density-5 px-5",
        )}
      >
        <div className="space-y-density-2 min-w-0">
          {embedded ? null : (
            <Badge
              variant={AUTO_CHECKIN_STATUS_BADGE_VARIANTS[panel.status]}
              size="sm"
            >
              {getAutoCheckinStatusLabel(panel.status, t)}
            </Badge>
          )}
          <div className="text-foreground text-xl font-semibold">
            {panel.successCount}/{panel.totalEligible}
          </div>
          <div className="dark:text-secondary-foreground text-muted-foreground text-sm leading-6">
            {t("optionsOverview:autoCheckin.summary")}
          </div>
          {emptyDescription ? (
            <div className="text-muted-foreground text-sm leading-6">
              {emptyDescription}
            </div>
          ) : null}
        </div>

        <div className="gap-y-density-2 grid grid-cols-1 gap-x-2 sm:grid-cols-3">
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

        <div className="text-muted-foreground space-y-density-1 text-xs">
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

      {actionsRow}
    </>
  )

  if (embedded) {
    return <div className="flex flex-col">{content}</div>
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
    <div className="gap-y-density-3 flex min-w-0 justify-between gap-x-3">
      <span className="shrink-0">{label}</span>
      <span className="text-secondary-foreground truncate font-medium">
        {value ? new Date(value).toLocaleString() : fallback}
      </span>
    </div>
  )
}
