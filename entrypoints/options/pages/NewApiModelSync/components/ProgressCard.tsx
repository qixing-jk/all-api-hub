import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import type { ExecutionProgress } from "~/types/newApiModelSync"

interface ProgressCardProps {
  progress: ExecutionProgress
}

/**
 * Shows an inline card while a model sync execution is running.
 * @param props Component props containing execution progress data.
 * @returns Progress indicator card or null when idle.
 */
export default function ProgressCard(props: ProgressCardProps) {
  const { progress } = props
  const { t } = useTranslation("newApiModelSync")

  if (!progress?.isRunning) {
    return null
  }

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
      <CardContent
        padding="default"
        spacing="none"
        className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left"
      >
        <ArrowPathIcon className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
        <div className="flex flex-col items-center sm:items-start">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            {t("execution.status.running")}
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t("execution.progress.running", {
              completed: progress.completed,
              total: progress.total,
            })}
            {progress.currentChannel && ` - ${progress.currentChannel}`}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
