import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import type { ExecutionProgress } from "~/types/newApiModelSync"

interface ProgressCardProps {
  progress: ExecutionProgress
}

export default function ProgressCard({ progress }: ProgressCardProps) {
  const { t } = useTranslation("newApiModelSync")

  if (!progress?.isRunning) {
    return null
  }

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
      <CardContent padding="default" className="flex items-center gap-3">
        <ArrowPathIcon className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
        <div className="flex-1">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            {t("execution.status.running")}
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t("execution.progress.running", {
              completed: progress.completed,
              total: progress.total
            })}
            {progress.currentChannel && ` - ${progress.currentChannel}`}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
