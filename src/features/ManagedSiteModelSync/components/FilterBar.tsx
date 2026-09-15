import { CircleCheck, CircleX, List, Search } from "lucide-react"
import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"
import { type ExecutionStatistics } from "~/types/managedSiteModelSync"

export type FilterStatus = "all" | "success" | "failed"

interface FilterBarProps {
  status: FilterStatus
  statistics: ExecutionStatistics
  keyword: string
  onStatusChange: (status: FilterStatus) => void
  onKeywordChange: (keyword: string) => void
}

/**
 * Filters execution records by status and keyword with quick counts.
 * @param props Component props container.
 * @param props.status Active status filter.
 * @param props.statistics Execution aggregate stats for badges.
 * @param props.keyword Current search keyword.
 * @param props.onStatusChange Handler to change status filter.
 * @param props.onKeywordChange Handler to change search keyword.
 * @returns Filter controls with status chips and search input.
 */
export default function FilterBar({
  status,
  statistics,
  keyword,
  onStatusChange,
  onKeywordChange,
}: FilterBarProps) {
  const { t } = useTranslation("managedSiteModelSync")

  const renderFilterButton = (
    value: FilterStatus,
    label: string,
    selectedClassName: string,
    icon: ReactNode,
    count?: number,
  ) => (
    <button
      type="button"
      aria-pressed={status === value}
      onClick={() => onStatusChange(value)}
      className={`gap-y-density-1-5 py-density-1-5 flex min-h-(--density-control-xs) items-center gap-x-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
        status === value
          ? selectedClassName
          : "bg-muted text-secondary-foreground hover:bg-secondary dark:bg-secondary dark:hover:bg-surface-strong"
      }`}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            status === value
              ? "bg-overlay/10"
              : "bg-secondary text-muted-foreground dark:bg-surface-strong dark:text-secondary-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )

  return (
    <div className="gap-y-density-3 flex flex-wrap gap-x-3">
      <div className="gap-y-density-2 flex gap-x-2">
        {renderFilterButton(
          "all",
          t("execution.filters.all"),
          "bg-primary text-primary-foreground",
          <List className="h-4 w-4" />,
          statistics.total,
        )}
        {renderFilterButton(
          "success",
          t("execution.filters.success"),
          "bg-success text-success-foreground",
          <CircleCheck className="h-4 w-4" />,
          statistics.successCount,
        )}
        {renderFilterButton(
          "failed",
          t("execution.filters.failed"),
          "bg-destructive text-destructive-foreground",
          <CircleX className="h-4 w-4" />,
          statistics.failureCount,
        )}
      </div>
      <div className="relative flex-1 md:max-w-xs">
        <Input
          type="text"
          placeholder={t("execution.filters.searchPlaceholder") as string}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          onClear={() => onKeywordChange("")}
          clearButtonLabel={t("common:actions.clear")}
        />
      </div>
    </div>
  )
}
