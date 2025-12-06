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
 * @param props isRunning locks run button; callbacks handle actions.
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
