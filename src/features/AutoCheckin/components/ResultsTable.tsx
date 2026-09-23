import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Card,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui"
import { Z_INDEX } from "~/constants/designTokens"
import {
  countActiveResultFilterDimensions,
  EMPTY_AUTO_CHECKIN_RESULT_FILTER,
  filterAutoCheckinResults,
  getAutoCheckinResultMessage,
  isAutoCheckinReasonFilterActive,
  type AutoCheckinResultFilter,
} from "~/features/AutoCheckin/utils/autoCheckin"
import { cn } from "~/lib/utils"
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
import type { SiteTypeMismatchMap } from "~/services/siteDetection/siteTypeObservations"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

import { useClampedTablePagination } from "../hooks/useClampedTablePagination"
import { compareAccountTableIdentity } from "../utils/tableUtils"
import FilterBar from "./FilterBar"
import type { ResultsTableActionsProps } from "./ResultsTable.types"
import ResultsTableRow from "./ResultsTableRow"
import SortableTableHead from "./SortableTableHead"
import TableFilteredEmptyState from "./TableFilteredEmptyState"
import TablePagination, {
  DEFAULT_AUTO_CHECKIN_TABLE_PAGE_SIZE,
} from "./TablePagination"

interface ResultsTableProps extends ResultsTableActionsProps {
  results: CheckinAccountResult[]
  /**
   * Site type each account's failed run resolved to, already reduced to what
   * still applies, keyed by account id.
   */
  siteTypeMismatches?: SiteTypeMismatchMap
}

const RESULT_STATUS_SORT_RANK: Record<CheckinResultStatus, number> = {
  [CHECKIN_RESULT_STATUS.FAILED]: 0,
  [CHECKIN_RESULT_STATUS.UNCERTAIN]: 1,
  [CHECKIN_RESULT_STATUS.SKIPPED]: 2,
  [CHECKIN_RESULT_STATUS.SUCCESS]: 3,
  [CHECKIN_RESULT_STATUS.ALREADY_CHECKED]: 4,
}

/**
 * Renders auto-checkin execution results with status badges, timestamps, and action buttons.
 */
export default function ResultsTable({
  results,
  siteTypeMismatches,
  ...actionProps
}: ResultsTableProps) {
  const { t } = useTranslation(["autoCheckin", "account"])
  const forceShowActions = Boolean(actionProps.showDevActions)
  const [keyword, setKeyword] = useState("")
  const [filter, setFilter] = useState<AutoCheckinResultFilter>(
    EMPTY_AUTO_CHECKIN_RESULT_FILTER,
  )
  const [sorting, setSorting] = useState<SortingState>([
    { id: "status", desc: false },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_AUTO_CHECKIN_TABLE_PAGE_SIZE,
  })

  const columns = useMemo<ColumnDef<CheckinAccountResult>[]>(
    () => [
      {
        accessorKey: "accountName",
        header: t("execution.table.accountName"),
        enableGlobalFilter: true,
        sortingFn: (left, right) =>
          compareAccountTableIdentity(left.original, right.original),
      },
      {
        accessorKey: "status",
        header: t("execution.table.status"),
        enableGlobalFilter: false,
        sortingFn: (left, right) => {
          return (
            RESULT_STATUS_SORT_RANK[left.original.status] -
              RESULT_STATUS_SORT_RANK[right.original.status] ||
            right.original.timestamp - left.original.timestamp
          )
        },
        filterFn: ((row, _columnId, value: AutoCheckinResultFilter) =>
          filterAutoCheckinResults([row.original], value, "", t).length >
          0) as FilterFn<CheckinAccountResult>,
      },
      {
        id: "message",
        accessorFn: (result) => getAutoCheckinResultMessage(t, result),
        header: t("execution.table.message"),
        enableGlobalFilter: false,
        enableSorting: false,
      },
      {
        accessorKey: "timestamp",
        header: t("execution.table.time"),
        enableGlobalFilter: false,
        sortDescFirst: true,
      },
      {
        id: "actions",
        header: t("execution.table.actions"),
        enableGlobalFilter: false,
        enableSorting: false,
      },
    ],
    [t],
  )

  const globalFilterFn = useMemo<FilterFn<CheckinAccountResult>>(
    () => (row, _columnId, value) =>
      filterAutoCheckinResults(
        [row.original],
        EMPTY_AUTO_CHECKIN_RESULT_FILTER,
        String(value),
        t,
      ).length > 0,
    [t],
  )

  const columnFilters = useMemo<ColumnFiltersState>(
    () =>
      filter.statuses.length === 0 && !isAutoCheckinReasonFilterActive(filter)
        ? []
        : [{ id: "status", value: filter }],
    [filter],
  )

  const table = useReactTable({
    data: results,
    columns,
    state: { sorting, pagination, globalFilter: keyword, columnFilters },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setKeyword,
    globalFilterFn,
    getRowId: (result) => result.accountId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: false,
    enableSortingRemoval: false,
  })

  const filteredCount = table.getFilteredRowModel().rows.length
  useClampedTablePagination(table)

  const setResultFilter = (nextFilter: AutoCheckinResultFilter) => {
    setFilter(nextFilter)
    table.setPageIndex(0)
  }

  const setSearchKeyword = (nextKeyword: string) => {
    setKeyword(nextKeyword)
    table.setPageIndex(0)
  }

  const trackColumnSort = () => {
    void trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAutoCheckinResults,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinFilterBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ResultFilter,
        mode: PRODUCT_ANALYTICS_MODE_IDS.SortFilter,
        filterCount: countActiveResultFilterDimensions(filter, keyword) + 1,
        resultCount: filteredCount,
      },
    })
  }

  const sortableHeader = (columnId: "accountName" | "status" | "timestamp") => {
    const column = table.getColumn(columnId)
    if (!column) return null
    const label = String(column.columnDef.header)

    return (
      <SortableTableHead
        column={column}
        label={label}
        className={cn(
          columnId === "accountName" &&
            "w-40 max-w-40 min-w-40 pl-4 [@container(min-width:48rem)]:w-56 [@container(min-width:48rem)]:max-w-56 [@container(min-width:48rem)]:min-w-56 [@container(min-width:48rem)]:pl-6",
          columnId === "status" && "px-4 [@container(min-width:48rem)]:px-6",
        )}
        onSort={trackColumnSort}
      />
    )
  }

  return (
    <Card padding="none">
      <FilterBar
        accountResults={results}
        filter={filter}
        keyword={keyword}
        onFilterChange={setResultFilter}
        onKeywordChange={setSearchKeyword}
      />
      {forceShowActions && (
        <div className="border-warning-border bg-warning-soft text-warning-soft-foreground py-density-2 border-b px-6 text-xs">
          {t("execution.actions.devModeHint")}
        </div>
      )}
      {filteredCount === 0 ? (
        <TableFilteredEmptyState
          title={t("execution.empty.noResults")}
          description={t("execution.empty.noResultsDesc")}
          clearLabel={t("execution.filters.clearAll")}
          onClearFilters={() => {
            setResultFilter(EMPTY_AUTO_CHECKIN_RESULT_FILTER)
            setSearchKeyword("")
          }}
        />
      ) : (
        <div className="[container-type:inline-size]">
          <Table className="min-w-[64rem]">
            <TableHeader className="bg-surface-subtle dark:bg-card">
              <TableRow className="border-border hover:bg-transparent">
                {sortableHeader("accountName")}
                {sortableHeader("status")}
                <TableHead className="text-muted-foreground py-density-3 h-auto px-6 text-xs font-medium tracking-wider uppercase">
                  {t("execution.table.message")}
                </TableHead>
                {sortableHeader("timestamp")}
                <TableHead
                  className={cn(
                    "border-border bg-surface-subtle text-muted-foreground dark:bg-card py-density-3 sticky right-0 h-auto w-12 min-w-12 border-l px-2 text-right text-xs font-medium tracking-wider uppercase [@container(min-width:48rem)]:w-auto [@container(min-width:48rem)]:min-w-0 [@container(min-width:48rem)]:px-3",
                    Z_INDEX.tableStickyHeader,
                  )}
                >
                  {t("execution.table.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-card dark:bg-background">
              {table.getRowModel().rows.map(({ original: result }) => (
                <ResultsTableRow
                  key={result.accountId}
                  result={result}
                  siteTypeMismatch={siteTypeMismatches?.[result.accountId]}
                  {...actionProps}
                />
              ))}
            </TableBody>
          </Table>
          <TablePagination
            id="auto-checkin-results"
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            total={filteredCount}
            onPageIndexChange={table.setPageIndex}
            onPageSizeChange={(nextPageSize) => {
              table.setPageSize(nextPageSize)
              table.setPageIndex(0)
            }}
          />
        </div>
      )}
    </Card>
  )
}
