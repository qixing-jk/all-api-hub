import {
  CheckCircleIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline"
import { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"
import { ExecutionStatistics } from "~/types/newApiModelSync"

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
  const { t } = useTranslation("newApiModelSync")

  const renderFilterButton = (
    value: FilterStatus,
    color: string,
    icon: ReactNode,
    count?: number,
  ) => (
    <button
      onClick={() => onStatusChange(value)}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        status === value
          ? `${color} text-white`
          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
      }`}
    >
      {icon}
      <span>{t(`execution.filters.${value}`)}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            status === value
              ? "bg-white/20 text-white"
              : "bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex gap-2">
        {renderFilterButton(
          "all",
          "bg-blue-600",
          <ListBulletIcon className="h-4 w-4" />,
          statistics.total,
        )}
        {renderFilterButton(
          "success",
          "bg-green-600",
          <CheckCircleIcon className="h-4 w-4" />,
          statistics.successCount,
        )}
        {renderFilterButton(
          "failed",
          "bg-red-600",
          <XCircleIcon className="h-4 w-4" />,
          statistics.failureCount,
        )}
      </div>
      <div className="relative flex-1 md:max-w-xs">
        <Input
          type="text"
          placeholder={t("execution.filters.searchPlaceholder") as string}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
        />
      </div>
    </div>
  )
}
