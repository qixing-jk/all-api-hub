import {
  ArrowPathIcon,
  BugAntIcon,
  PlayIcon,
} from "@heroicons/react/24/outline"
import type { MouseEventHandler } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button } from "~/components/ui"

interface ActionBarProps {
  isRunning: boolean
  isRefreshing?: boolean
  isDebugTriggering?: boolean
  isOpeningFailedManualSignIns?: boolean
  canOpenFailedManualSignIns?: boolean
  onRunNow: () => void
  onRefresh: () => void
  onOpenFailedManualSignIns?: MouseEventHandler<HTMLButtonElement>
  showDebugButtons?: boolean
  onDebugTriggerDailyAlarmNow?: () => void
  onDebugTriggerRetryAlarmNow?: () => void
  onDebugScheduleDailyAlarmForToday?: () => void
  onDebugEvaluateUiOpenPretrigger?: () => void
  onDebugTriggerUiOpenPretrigger?: () => void
  onDebugResetLastDailyRunDay?: () => void
}

/**
 * Provides run-now and refresh buttons for the auto-checkin dashboard.
 * @param props Component props bundle.
 * @param props.isRunning Disables the run-now action while execution is in progress.
 * @param props.isRefreshing Shows a loading state while the latest snapshot is being refreshed.
 * @param props.isDebugTriggering Disables actions while triggering debug alarm handlers.
 * @param props.isOpeningFailedManualSignIns Disables actions while bulk-opening failed manual sign-in pages.
 * @param props.canOpenFailedManualSignIns Whether the current status contains failed accounts that can be bulk-opened.
 * @param props.onRunNow Handler triggered to start a manual execution.
 * @param props.onRefresh Handler triggered to refresh snapshot data.
 * @param props.onOpenFailedManualSignIns Handler triggered to bulk-open failed accounts' manual sign-in pages.
 * @param props.showDebugButtons When true, shows dev-only alarm debug buttons.
 * @param props.onDebugTriggerDailyAlarmNow Triggers the daily alarm handler immediately (dev-only).
 * @param props.onDebugTriggerRetryAlarmNow Triggers the retry alarm handler immediately (dev-only).
 * @param props.onDebugScheduleDailyAlarmForToday Schedules the daily alarm to run later today (dev-only).
 * @param props.onDebugEvaluateUiOpenPretrigger Evaluates UI-open pre-trigger eligibility (dev-only).
 * @param props.onDebugTriggerUiOpenPretrigger Triggers the UI-open pre-trigger flow immediately (dev-only).
 * @param props.onDebugResetLastDailyRunDay Clears the stored last-daily marker so the flow can be rerun (dev-only).
 */
export default function ActionBar({
  isRunning,
  isRefreshing,
  isDebugTriggering,
  isOpeningFailedManualSignIns,
  canOpenFailedManualSignIns,
  onRunNow,
  onRefresh,
  onOpenFailedManualSignIns,
  showDebugButtons,
  onDebugTriggerDailyAlarmNow,
  onDebugTriggerRetryAlarmNow,
  onDebugScheduleDailyAlarmForToday,
  onDebugEvaluateUiOpenPretrigger,
  onDebugTriggerUiOpenPretrigger,
  onDebugResetLastDailyRunDay,
}: ActionBarProps) {
  const { t } = useTranslation("autoCheckin")
  const isBusy =
    isRunning ||
    isDebugTriggering === true ||
    isOpeningFailedManualSignIns === true
  const bulkManualHint = t("execution.hints.openFailedManualNewWindow")

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={onRunNow}
          disabled={isBusy}
          leftIcon={<PlayIcon className="h-4 w-4" />}
        >
          {t("execution.runNow")}
        </Button>
        <Button
          onClick={onRefresh}
          variant="secondary"
          disabled={isBusy || isRefreshing === true}
          loading={isRefreshing}
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
        >
          {t("execution.refresh")}
        </Button>
        <Button
          onClick={onOpenFailedManualSignIns}
          variant="outline"
          disabled={
            isBusy || !canOpenFailedManualSignIns || !onOpenFailedManualSignIns
          }
          loading={isOpeningFailedManualSignIns}
          leftIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
          title={bulkManualHint}
        >
          {t("execution.actions.openFailedManual")}
        </Button>
        {showDebugButtons && (
          <>
            <Button
              onClick={onDebugTriggerDailyAlarmNow}
              variant="outline"
              disabled={isBusy || !onDebugTriggerDailyAlarmNow}
              leftIcon={<BugAntIcon className="h-4 w-4" />}
            >
              {t("execution.debug.triggerDailyAlarmNow")}
            </Button>
            <Button
              onClick={onDebugTriggerRetryAlarmNow}
              variant="outline"
              disabled={isBusy || !onDebugTriggerRetryAlarmNow}
              leftIcon={<BugAntIcon className="h-4 w-4" />}
            >
              {t("execution.debug.triggerRetryAlarmNow")}
            </Button>
            <Button
              onClick={onDebugScheduleDailyAlarmForToday}
              variant="outline"
              disabled={isBusy || !onDebugScheduleDailyAlarmForToday}
              leftIcon={<BugAntIcon className="h-4 w-4" />}
            >
              {t("execution.debug.scheduleDailyAlarmForToday")}
            </Button>
            <Button
              onClick={onDebugEvaluateUiOpenPretrigger}
              variant="outline"
              disabled={isBusy || !onDebugEvaluateUiOpenPretrigger}
              leftIcon={<BugAntIcon className="h-4 w-4" />}
            >
              {t("execution.debug.evaluateUiOpenPretrigger")}
            </Button>
            <Button
              onClick={onDebugTriggerUiOpenPretrigger}
              variant="outline"
              disabled={isBusy || !onDebugTriggerUiOpenPretrigger}
              leftIcon={<BugAntIcon className="h-4 w-4" />}
            >
              {t("execution.debug.triggerUiOpenPretrigger")}
            </Button>
            <Button
              onClick={onDebugResetLastDailyRunDay}
              variant="outline"
              disabled={isBusy || !onDebugResetLastDailyRunDay}
              leftIcon={<BugAntIcon className="h-4 w-4" />}
            >
              {t("execution.debug.resetLastDailyRunDay")}
            </Button>
          </>
        )}
      </div>
      {canOpenFailedManualSignIns && onOpenFailedManualSignIns ? (
        <p className="text-muted-foreground text-xs">{bulkManualHint}</p>
      ) : null}
    </div>
  )
}
