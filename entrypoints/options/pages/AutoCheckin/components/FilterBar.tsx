import {
  CheckCircleIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline"
import { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

export const FILTER_STATUS = {
  ALL: "all",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const

export type FilterStatus = (typeof FILTER_STATUS)[keyof typeof FILTER_STATUS]

interface FilterBarProps {
  accountResults: CheckinAccountResult[]
  status: FilterStatus
  keyword: string
  onStatusChange: (status: FilterStatus) => void
  onKeywordChange: (keyword: string) => void
}

export default function FilterBar({
  accountResults,
  status,
  keyword,
  onStatusChange,
  onKeywordChange,
}: FilterBarProps) {
  const { t } = useTranslation("autoCheckin")

  const totalCount = accountResults.length
  const successCount = accountResults.filter(
    (r) =>
      r.status === CHECKIN_RESULT_STATUS.SUCCESS ||
      r.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ).length
  const failedCount = accountResults.filter(
    (r) => r.status === CHECKIN_RESULT_STATUS.FAILED,
  ).length
  const skippedCount = accountResults.filter(
    (r) => r.status === CHECKIN_RESULT_STATUS.SKIPPED,
  ).length

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
          FILTER_STATUS.ALL,
          "bg-blue-600",
          <ListBulletIcon className="h-4 w-4" />,
          totalCount,
        )}
        {renderFilterButton(
          FILTER_STATUS.SUCCESS,
          "bg-green-600",
          <CheckCircleIcon className="h-4 w-4" />,
          successCount,
        )}
        {renderFilterButton(
          FILTER_STATUS.FAILED,
          "bg-red-600",
          <XCircleIcon className="h-4 w-4" />,
          failedCount,
        )}
        {renderFilterButton(
          FILTER_STATUS.SKIPPED,
          "bg-yellow-600",
          <ListBulletIcon className="h-4 w-4" />,
          skippedCount,
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
