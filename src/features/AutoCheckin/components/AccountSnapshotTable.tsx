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
import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableHeader,
  TableRow,
} from "~/components/ui"
import {
  filterAutoCheckinSnapshots,
  getAutoCheckinSnapshotReadinessCategory,
  getAutoCheckinSnapshotStatus,
  SNAPSHOT_READINESS_FILTER,
  SNAPSHOT_STATUS_FILTER,
  type SnapshotReadinessFilter,
  type SnapshotStatusFilter,
} from "~/features/AutoCheckin/utils/snapshotFilters"
import type { AutoCheckinAccountSnapshot } from "~/types/autoCheckin"

import { useClampedTablePagination } from "../hooks/useClampedTablePagination"
import { compareAccountTableIdentity } from "../utils/tableUtils"
import AccountSnapshotTableRow from "./AccountSnapshotTableRow"
import SortableTableHead from "./SortableTableHead"
import TableFilteredEmptyState from "./TableFilteredEmptyState"
import TableFilterToolbar from "./TableFilterToolbar"
import TablePagination, {
  DEFAULT_AUTO_CHECKIN_TABLE_PAGE_SIZE,
} from "./TablePagination"

interface AccountSnapshotTableProps {
  snapshots: AutoCheckinAccountSnapshot[]
}

/** Account readiness and latest execution outcome in a sortable table. */
export default function AccountSnapshotTable({
  snapshots,
}: AccountSnapshotTableProps) {
  const { t } = useTranslation("autoCheckin")
  const [keyword, setKeyword] = useState("")
  const [readinessFilter, setReadinessFilter] =
    useState<SnapshotReadinessFilter>(SNAPSHOT_READINESS_FILTER.ALL)
  const [statusFilter, setStatusFilter] = useState<SnapshotStatusFilter>(
    SNAPSHOT_STATUS_FILTER.ALL,
  )
  const [sorting, setSorting] = useState<SortingState>([
    { id: "accountName", desc: false },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_AUTO_CHECKIN_TABLE_PAGE_SIZE,
  })

  const columns = useMemo<ColumnDef<AutoCheckinAccountSnapshot>[]>(
    () => [
      {
        accessorKey: "accountName",
        header: t("execution.table.accountName"),
        enableGlobalFilter: true,
        sortingFn: (left, right) =>
          compareAccountTableIdentity(left.original, right.original),
      },
      {
        id: "autoCheckin",
        accessorFn: (snapshot) => snapshot.autoCheckinEnabled,
        header: t("snapshot.table.autoCheckin"),
        enableGlobalFilter: false,
      },
      {
        id: "readiness",
        accessorFn: getAutoCheckinSnapshotReadinessCategory,
        header: t("snapshot.filters.readinessLabel"),
        enableGlobalFilter: false,
        filterFn: ((row, _columnId, value: SnapshotReadinessFilter) =>
          getAutoCheckinSnapshotReadinessCategory(row.original) ===
          value) as FilterFn<AutoCheckinAccountSnapshot>,
      },
      {
        id: "latestStatus",
        accessorFn: getAutoCheckinSnapshotStatus,
        header: t("snapshot.table.status"),
        enableGlobalFilter: false,
        filterFn: ((row, _columnId, value: SnapshotStatusFilter) =>
          getAutoCheckinSnapshotStatus(row.original) ===
          value) as FilterFn<AutoCheckinAccountSnapshot>,
      },
      {
        id: "lastResult",
        accessorFn: (snapshot) => snapshot.lastResult?.timestamp ?? 0,
        header: t("snapshot.table.lastResult"),
        enableGlobalFilter: false,
        sortDescFirst: true,
      },
    ],
    [t],
  )

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = []
    if (readinessFilter !== SNAPSHOT_READINESS_FILTER.ALL)
      filters.push({ id: "readiness", value: readinessFilter })
    if (statusFilter !== SNAPSHOT_STATUS_FILTER.ALL)
      filters.push({ id: "latestStatus", value: statusFilter })
    return filters
  }, [readinessFilter, statusFilter])

  const globalFilterFn = useMemo<FilterFn<AutoCheckinAccountSnapshot>>(
    () => (row, _columnId, value) =>
      filterAutoCheckinSnapshots(
        [row.original],
        SNAPSHOT_READINESS_FILTER.ALL,
        SNAPSHOT_STATUS_FILTER.ALL,
        String(value),
        t,
      ).length > 0,
    [t],
  )

  const table = useReactTable({
    data: snapshots,
    columns,
    state: { sorting, pagination, globalFilter: keyword, columnFilters },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setKeyword,
    globalFilterFn,
    getRowId: (snapshot) => snapshot.accountId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: false,
    enableSortingRemoval: false,
  })

  const filteredCount = table.getFilteredRowModel().rows.length
  useClampedTablePagination(table)

  const isFiltered =
    Boolean(keyword.trim()) ||
    readinessFilter !== SNAPSHOT_READINESS_FILTER.ALL ||
    statusFilter !== SNAPSHOT_STATUS_FILTER.ALL
  const countLabel = isFiltered
    ? t("snapshot.filters.countFiltered", {
        filtered: filteredCount,
        total: snapshots.length,
      })
    : t("snapshot.filters.countTotal", { total: snapshots.length })
  const clearFilters = () => {
    setKeyword("")
    setReadinessFilter(SNAPSHOT_READINESS_FILTER.ALL)
    setStatusFilter(SNAPSHOT_STATUS_FILTER.ALL)
    table.setPageIndex(0)
  }

  const sortableHeader = (columnId: string) => {
    const column = table.getColumn(columnId)
    if (!column) return null
    const label = String(column.columnDef.header)
    return (
      <SortableTableHead column={column} label={label} className="first:pl-6" />
    )
  }

  const resetPage = () => table.setPageIndex(0)

  return (
    <Card padding="none">
      <TableFilterToolbar
        countLabel={countLabel}
        clearLabel={t("snapshot.filters.clearAll")}
        showClear={isFiltered && filteredCount > 0}
        onClearFilters={clearFilters}
        controlsClassName="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_13rem_11rem]"
      >
        <Input
          type="text"
          aria-label={t("snapshot.filters.searchLabel")}
          placeholder={t("snapshot.filters.searchPlaceholder")}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            resetPage()
          }}
          leftIcon={<Search className="h-4 w-4" />}
          onClear={() => setKeyword("")}
          clearButtonLabel={t("common:actions.clear")}
        />
        <Select
          value={readinessFilter}
          onValueChange={(value) => {
            setReadinessFilter(value as SnapshotReadinessFilter)
            resetPage()
          }}
        >
          <SelectTrigger
            className="h-9 w-full"
            aria-label={t("snapshot.filters.readinessLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.ALL}>
              {t("snapshot.filters.readinessAll")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.READY}>
              {t("snapshot.filters.readinessReady")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED}>
              {t("snapshot.filters.readinessSetupRequired")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.DISABLED}>
              {t("snapshot.filters.readinessDisabled")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.UNSUPPORTED}>
              {t("snapshot.filters.readinessUnsupported")}
            </SelectItem>
            <SelectItem
              value={SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE}
            >
              {t("snapshot.filters.readinessTemporarilyUnavailable")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as SnapshotStatusFilter)
            resetPage()
          }}
        >
          <SelectTrigger
            className="h-9 w-full"
            aria-label={t("snapshot.filters.statusLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.ALL}>
              {t("snapshot.filters.statusAll")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.SUCCESS}>
              {t("execution.status.success")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.FAILED}>
              {t("execution.status.failed")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.SKIPPED}>
              {t("execution.status.skipped")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.PENDING}>
              {t("snapshot.badges.pending")}
            </SelectItem>
          </SelectContent>
        </Select>
      </TableFilterToolbar>

      {filteredCount === 0 ? (
        <TableFilteredEmptyState
          title={t("snapshot.filters.noMatches")}
          description={t("snapshot.filters.noMatchesDescription")}
          clearLabel={t("snapshot.filters.clearAll")}
          onClearFilters={clearFilters}
        />
      ) : (
        <>
          <Table className="min-w-[58rem]">
            <TableHeader className="bg-gray-50 dark:bg-gray-800">
              <TableRow className="border-gray-200 hover:bg-transparent dark:border-gray-700">
                {sortableHeader("accountName")}
                {sortableHeader("autoCheckin")}
                {sortableHeader("readiness")}
                {sortableHeader("latestStatus")}
                {sortableHeader("lastResult")}
              </TableRow>
            </TableHeader>
            <TableBody className="bg-white dark:bg-gray-900">
              {table.getRowModel().rows.map(({ original: snapshot }) => (
                <AccountSnapshotTableRow
                  key={snapshot.accountId}
                  snapshot={snapshot}
                />
              ))}
            </TableBody>
          </Table>
          <TablePagination
            id="auto-checkin-readiness"
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            total={filteredCount}
            onPageIndexChange={table.setPageIndex}
            onPageSizeChange={(pageSize) => {
              table.setPageSize(pageSize)
              table.setPageIndex(0)
            }}
          />
        </>
      )}
    </Card>
  )
}
