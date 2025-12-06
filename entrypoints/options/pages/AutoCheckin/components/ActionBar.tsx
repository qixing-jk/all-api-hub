import { ArrowPathIcon, PlayIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

interface ActionBarProps {
  isRunning: boolean
  onRunNow: () => void
  onRefresh: () => void
}

/**
 * Provides run-now and refresh buttons for the auto-checkin dashboard.
 * @param props Component props bundle.
 * @param props.isRunning Disables the run-now action while execution is in progress.
 * @param props.onRunNow Handler triggered to start a manual execution.
 * @param props.onRefresh Handler triggered to refresh snapshot data.
 */
export default function ActionBar({
  isRunning,
  onRunNow,
  onRefresh,
}: ActionBarProps) {
  const { t } = useTranslation("autoCheckin")

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={onRunNow}
        disabled={isRunning}
        leftIcon={<PlayIcon className="h-4 w-4" />}
      >
        {t("execution.runNow")}
      </Button>
      <Button
        onClick={onRefresh}
        variant="secondary"
        leftIcon={<ArrowPathIcon className="h-4 w-4" />}
      >
        {t("execution.refresh")}
      </Button>
    </div>
  )
}
