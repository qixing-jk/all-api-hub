import {
  ArrowPathIcon,
  BugAntIcon,
  PlayIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

interface ActionBarProps {
  isRunning: boolean
  isDebugTriggering?: boolean
  onRunNow: () => void
  onRefresh: () => void
  showDebugButtons?: boolean
  onDebugTriggerDailyAlarmNow?: () => void
  onDebugTriggerRetryAlarmNow?: () => void
}

/**
 * Provides run-now and refresh buttons for the auto-checkin dashboard.
 * @param props Component props bundle.
 * @param props.isRunning Disables the run-now action while execution is in progress.
 * @param props.isDebugTriggering Disables actions while triggering debug alarm handlers.
 * @param props.onRunNow Handler triggered to start a manual execution.
 * @param props.onRefresh Handler triggered to refresh snapshot data.
 * @param props.showDebugButtons When true, shows dev-only alarm debug buttons.
 * @param props.onDebugTriggerDailyAlarmNow Triggers the daily alarm handler immediately (dev-only).
 * @param props.onDebugTriggerRetryAlarmNow Triggers the retry alarm handler immediately (dev-only).
 */
export default function ActionBar({
  isRunning,
  isDebugTriggering,
  onRunNow,
  onRefresh,
  showDebugButtons,
  onDebugTriggerDailyAlarmNow,
  onDebugTriggerRetryAlarmNow,
}: ActionBarProps) {
  const { t } = useTranslation("autoCheckin")
  const isBusy = isRunning || isDebugTriggering === true

  return (
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
        disabled={isBusy}
        leftIcon={<ArrowPathIcon className="h-4 w-4" />}
      >
        {t("execution.refresh")}
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
        </>
      )}
    </div>
  )
}
