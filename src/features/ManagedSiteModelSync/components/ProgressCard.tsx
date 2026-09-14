import { RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import type { ExecutionProgress } from "~/types/managedSiteModelSync"

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
  const { t } = useTranslation("managedSiteModelSync")

  if (!progress?.isRunning) {
    return null
  }

  return (
    <Card className="border-theme-200 bg-theme-50 dark:border-theme-900 dark:bg-theme-950">
      <CardContent
        padding="default"
        spacing="none"
        className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left"
      >
        <RefreshCw className="text-theme-600 dark:text-theme-400 h-5 w-5 shrink-0 animate-spin" />
        <div className="flex flex-col items-center sm:items-start">
          <p className="text-theme-900 dark:text-theme-100 font-medium">
            {t("execution.status.running")}
          </p>
          <p className="text-theme-700 dark:text-theme-300 text-sm">
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
