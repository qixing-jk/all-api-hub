import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import type { ExecutionStatistics } from "~/types/managedSiteModelSync"
import { formatFullTime } from "~/utils/core/formatters"

interface StatisticsCardProps {
  statistics: ExecutionStatistics
}

/**
 * Displays aggregate statistics for the most recent model sync execution.
 * @param props Component props containing execution statistics.
 * @returns Card with counts and timestamps.
 */
export default function StatisticsCard(props: StatisticsCardProps) {
  const { statistics } = props
  const { t } = useTranslation("managedSiteModelSync")

  return (
    <Card>
      <CardContent padding="md">
        <h4 className="text-foreground mb-density-4 text-lg font-semibold">
          {t("execution.lastExecution")}
        </h4>
        <div className="gap-y-density-4 grid grid-cols-2 gap-x-4 md:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-sm">
              {t("execution.statistics.total")}
            </p>
            <p className="text-foreground text-2xl font-bold">
              {statistics.total}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">
              {t("execution.statistics.success")}
            </p>
            <p className="text-success-text text-2xl font-bold">
              {statistics.successCount}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">
              {t("execution.statistics.failed")}
            </p>
            <p className="text-destructive-text text-2xl font-bold">
              {statistics.failureCount}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">
              {t("execution.statistics.duration")}
            </p>
            <p className="text-foreground text-2xl font-bold">
              {(statistics.durationMs / 1000).toFixed(1)}s
            </p>
          </div>
        </div>
        <div className="border-border mt-density-4 pt-density-4 border-t">
          <div className="gap-y-density-2 grid grid-cols-1 gap-x-2 text-sm md:grid-cols-2">
            <div>
              <span className="text-muted-foreground">
                {t("execution.statistics.startTime")}:{" "}
              </span>
              <span className="text-foreground">
                {formatFullTime(new Date(statistics.startedAt))}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("execution.statistics.endTime")}:{" "}
              </span>
              <span className="text-foreground">
                {formatFullTime(new Date(statistics.endedAt))}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
