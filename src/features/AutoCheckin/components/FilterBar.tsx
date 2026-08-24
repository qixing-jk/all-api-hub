import { CircleCheck, CircleX, List, Search, TriangleAlert } from "lucide-react"
import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"
import {
  FILTER_STATUS,
  filterAutoCheckinResults,
  type FilterStatus,
} from "~/features/AutoCheckin/utils/autoCheckin"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

import TableFilterToolbar from "./TableFilterToolbar"

export { FILTER_STATUS }
export type { FilterStatus }

interface FilterBarProps {
  accountResults: CheckinAccountResult[]
  status: FilterStatus
  keyword: string
  onStatusChange: (status: FilterStatus) => void
  onKeywordChange: (keyword: string) => void
}

/**
 * Filter controls for auto-checkin execution list: status buttons + keyword search.
 * @param props Component props bundle.
 * @param props.accountResults Account execution results used to derive counts.
 * @param props.status Current filter status value.
 * @param props.keyword Current keyword filter value.
 * @param props.onStatusChange Callback fired when status filter changes.
 * @param props.onKeywordChange Callback fired when keyword input changes.
 */
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
  const getFilteredResultCount = (
    nextStatus: FilterStatus,
    nextKeyword: string,
  ) =>
    filterAutoCheckinResults(accountResults, nextStatus, nextKeyword, t).length
  const filteredCount = getFilteredResultCount(status, keyword)
  const isFiltered = status !== FILTER_STATUS.ALL || Boolean(keyword.trim())
  const countLabel = isFiltered
    ? t("execution.filters.countFiltered", {
        filtered: filteredCount,
        total: totalCount,
      })
    : t("execution.filters.countTotal", { total: totalCount })
  const trackFilterSelection = (
    mode:
      | typeof PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
      | typeof PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
    nextStatus: FilterStatus = status,
    nextKeyword: string = keyword,
  ) => {
    const filterCount =
      (nextStatus === FILTER_STATUS.ALL ? 0 : 1) + (nextKeyword.trim() ? 1 : 0)

    void trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAutoCheckinResults,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinFilterBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ResultFilter,
        mode,
        filterCount,
        resultCount: getFilteredResultCount(nextStatus, nextKeyword),
      },
    })
  }

  const renderFilterButton = (
    value: FilterStatus,
    label: string,
    icon: ReactNode,
    count: number,
  ) => (
    <button
      type="button"
      aria-pressed={status === value}
      onClick={() => {
        onStatusChange(value)
        trackFilterSelection(PRODUCT_ANALYTICS_MODE_IDS.StatusFilter, value)
      }}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        status === value
          ? "border-blue-500 bg-blue-50 text-blue-700 shadow-xs dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
          : "border-transparent bg-gray-100/80 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="ml-0.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/10">
        {count}
      </span>
    </button>
  )

  return (
    <TableFilterToolbar
      countLabel={countLabel}
      clearLabel={t("execution.filters.clearAll")}
      showClear={isFiltered && filteredCount > 0}
      onClearFilters={() => {
        onStatusChange(FILTER_STATUS.ALL)
        onKeywordChange("")
        trackFilterSelection(
          keyword.trim()
            ? PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
            : PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
          FILTER_STATUS.ALL,
          "",
        )
      }}
      controlsClassName="flex flex-col gap-2 lg:flex-row lg:items-center"
    >
      <div className="relative w-full lg:max-w-xs">
        <Input
          type="text"
          aria-label={t("execution.filters.searchLabel")}
          placeholder={t("execution.filters.searchPlaceholder") as string}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          onClear={() => {
            onKeywordChange("")
            trackFilterSelection(
              PRODUCT_ANALYTICS_MODE_IDS.SearchFilter,
              status,
              "",
            )
          }}
          clearButtonLabel={t("common:actions.clear")}
        />
      </div>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("execution.filters.statusLabel")}
      >
        {renderFilterButton(
          FILTER_STATUS.ALL,
          t("execution.filters.all"),
          <List className="h-4 w-4" />,
          totalCount,
        )}
        {renderFilterButton(
          FILTER_STATUS.SUCCESS,
          t("execution.filters.success"),
          <CircleCheck className="h-4 w-4" />,
          successCount,
        )}
        {renderFilterButton(
          FILTER_STATUS.FAILED,
          t("execution.filters.failed"),
          <CircleX className="h-4 w-4" />,
          failedCount,
        )}
        {renderFilterButton(
          FILTER_STATUS.SKIPPED,
          t("execution.filters.skipped"),
          <TriangleAlert className="h-4 w-4" />,
          skippedCount,
        )}
      </div>
    </TableFilterToolbar>
  )
}
