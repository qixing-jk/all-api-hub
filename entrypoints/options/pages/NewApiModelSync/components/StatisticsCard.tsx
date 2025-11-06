import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import type { ExecutionStatistics } from "~/types/newApiModelSync"
import { formatFullTime } from "~/utils/formatters"

interface StatisticsCardProps {
  statistics: ExecutionStatistics
}

export default function StatisticsCard({ statistics }: StatisticsCardProps) {
  const { t } = useTranslation("newApiModelSync")

  return (
    <Card>
      <CardContent padding="md">
        <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          {t("execution.lastExecution")}
        </h4>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("execution.statistics.total")}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {statistics.total}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("execution.statistics.success")}
            </p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {statistics.successCount}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("execution.statistics.failed")}
            </p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {statistics.failureCount}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("execution.statistics.duration")}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(statistics.durationMs / 1000).toFixed(1)}s
            </p>
          </div>
        </div>
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <div>
              <span className="text-gray-600 dark:text-gray-400">
                {t("execution.statistics.startTime")}:{" "}
              </span>
              <span className="text-gray-900 dark:text-white">
                {formatFullTime(new Date(statistics.startedAt))}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">
                {t("execution.statistics.endTime")}:{" "}
              </span>
              <span className="text-gray-900 dark:text-white">
                {formatFullTime(new Date(statistics.endedAt))}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
