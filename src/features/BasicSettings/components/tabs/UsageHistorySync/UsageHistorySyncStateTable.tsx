import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, Checkbox } from "~/components/ui"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { cn } from "~/lib/utils"

import UsageHistorySyncRowActions from "./UsageHistorySyncRowActions"

export type UsageHistorySyncState =
  | "never"
  | "success"
  | "error"
  | "unsupported"

export type UsageHistoryAccountRow = {
  id: string
  siteName: string
  state: UsageHistorySyncState
  lastSyncAtMs: number | null
  lastSyncAtLabel: string
  lastError?: string
  lastWarning?: string
}

type CheckboxState = boolean | "indeterminate"

interface UsageHistorySyncStateTableProps {
  rows: UsageHistoryAccountRow[]
  isLoading: boolean
  hasAnyAccounts: boolean
  isSyncingAll: boolean
  syncingAccountIds: Set<string>
  onSyncAccounts: (accountIds: string[]) => void | Promise<void>
}

/**
 * Multi-select table for per-account usage-history sync status, with bulk + row actions.
 */
export default function UsageHistorySyncStateTable({
  rows,
  isLoading,
  hasAnyAccounts,
  isSyncingAll,
  syncingAccountIds,
  onSyncAccounts,
}: UsageHistorySyncStateTableProps) {
  const { t } = useTranslation("usageAnalytics")

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [sorting, setSorting] = useState<SortingState>([
    { id: "siteName", desc: false },
  ])

  const getStatusBadgeVariant = (state: UsageHistorySyncState) => {
    return state === "success"
      ? "success"
      : state === "unsupported"
        ? "warning"
        : state === "error"
          ? "destructive"
          : "secondary"
  }

  const columns = useMemo<ColumnDef<UsageHistoryAccountRow, unknown>[]>(() => {
    return [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllRowsSelected() ||
              (table.getIsSomeRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value: CheckboxState) =>
              table.toggleAllRowsSelected(!!value)
            }
            aria-label={t("syncTab.table.selectAll")}
            disabled={isSyncingAll}
          />
        ),
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: CheckboxState) =>
              row.toggleSelected(!!value)
            }
            aria-label={t("syncTab.table.selectRow", {
              name: row.original.siteName,
            })}
            disabled={isSyncingAll}
          />
        ),
        size: 16,
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "siteName",
        header: t("syncTab.table.columns.account"),
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <div className="max-w-[260px] truncate text-sm font-medium">
            {row.original.siteName}
          </div>
        ),
      },
      {
        accessorKey: "state",
        header: t("syncTab.table.columns.state"),
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <Badge
            variant={getStatusBadgeVariant(row.original.state) as any}
            className="shrink-0"
          >
            {t(`status.states.${row.original.state}`)}
          </Badge>
        ),
      },
      {
        id: "lastSyncAt",
        header: t("syncTab.table.columns.lastSyncAt"),
        accessorFn: (row) => row.lastSyncAtMs ?? 0,
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
            {row.original.lastSyncAtMs
              ? row.original.lastSyncAtLabel
              : t("status.never")}
          </div>
        ),
      },
      {
        id: "message",
        header: t("syncTab.table.columns.message"),
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <div className="space-y-1">
            {row.original.lastError && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {row.original.lastError}
              </div>
            )}
            {row.original.lastWarning && (
              <div className="text-xs text-amber-600 dark:text-amber-400">
                {row.original.lastWarning}
              </div>
            )}
            {!row.original.lastError && !row.original.lastWarning && (
              <div className="text-muted-foreground text-xs">
                {t("syncTab.table.noMessage")}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => {
          const accountId = row.original.id
          const isRowSyncing = isSyncingAll || syncingAccountIds.has(accountId)
          return (
            <UsageHistorySyncRowActions
              accountId={accountId}
              isSyncing={isRowSyncing}
              onSync={(id) => onSyncAccounts([id])}
            />
          )
        },
        enableSorting: false,
      },
    ]
  }, [isSyncingAll, onSyncAccounts, syncingAccountIds, t])

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    state: {
      rowSelection,
      sorting,
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
  })

  const selectedAccountIds = useMemo(() => {
    return Object.entries(rowSelection)
      .filter(([, selected]) => Boolean(selected))
      .map(([id]) => id)
  }, [rowSelection])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground text-xs">
          {t("syncTab.table.selectedCount", {
            count: selectedAccountIds.length,
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => void onSyncAccounts(selectedAccountIds)}
            disabled={!selectedAccountIds.length || isSyncingAll}
          >
            {t("syncTab.actions.syncSelected")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.resetRowSelection()}
            disabled={!selectedAccountIds.length || isSyncingAll}
          >
            {t("syncTab.actions.clearSelection")}
          </Button>
        </div>
      </div>

      <div className="dark:border-dark-bg-tertiary overflow-auto rounded-lg border border-gray-200">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.id === "actions" &&
                        "bg-background sticky right-0 z-20 border-l",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32">
                  <div className="text-muted-foreground text-sm">
                    {t("syncTab.table.loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "py-3",
                        cell.column.id === "actions" &&
                          "bg-background group-hover:bg-muted/50 data-[state=selected]:bg-muted sticky right-0 z-20 border-l",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="text-muted-foreground text-sm">
                    {hasAnyAccounts
                      ? t("syncTab.table.empty")
                      : t("syncTab.noAccounts")}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
