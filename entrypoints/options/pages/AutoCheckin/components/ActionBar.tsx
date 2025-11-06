import { ArrowPathIcon, PlayIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

interface ActionBarProps {
  isRunning: boolean
  onRunNow: () => void
  onRefresh: () => void
}

export default function ActionBar({
  isRunning,
  onRunNow,
  onRefresh
}: ActionBarProps) {
  const { t } = useTranslation("autoCheckin")

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={onRunNow}
        disabled={isRunning}
        className="flex items-center gap-2">
        <PlayIcon className="h-4 w-4" />
        <span>{t("execution.runNow")}</span>
      </Button>
      <Button
        onClick={onRefresh}
        variant="secondary"
        className="flex items-center gap-2">
        <ArrowPathIcon className="h-4 w-4" />
        <span>{t("execution.refresh")}</span>
      </Button>
    </div>
  )
}
