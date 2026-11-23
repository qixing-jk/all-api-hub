import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from "@tanstack/react-table"
import type { TFunction } from "i18next"
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
import { Z_INDEX } from "~/constants/designTokens"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { cn } from "~/lib/utils"
import { USAGE_HISTORY_SYNC_STATES } from "~/types/usageHistory"

import UsageHistorySyncRowActions from "./UsageHistorySyncRowActions"

export type UsageHistorySyncState =
  (typeof USAGE_HISTORY_SYNC_STATES)[keyof typeof USAGE_HISTORY_SYNC_STATES]

export type UsageHistoryAccountRow = {
  id: string
  accountName: string
  state?: UsageHistorySyncState
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
  onSyncAccounts: (accountIds: string[]) => Promise<void>
}

/**
 * Resolve the localized label for a usage-history sync state badge.
 */
function getUsageHistorySyncStateLabel(
  t: TFunction,
  state: UsageHistorySyncState | undefined,
) {
  switch (state) {
    case USAGE_HISTORY_SYNC_STATES.Never:
      return t("usageAnalytics:status.states.never")
    case USAGE_HISTORY_SYNC_STATES.Success:
      return t("usageAnalytics:status.states.success")
    case USAGE_HISTORY_SYNC_STATES.Error:
      return t("usageAnalytics:status.states.error")
    case USAGE_HISTORY_SYNC_STATES.Unsupported:
      return t("usageAnalytics:status.states.unsupported")
    default:
      return t("common:labels.unknown")
  }
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
    { id: "accountName", desc: false },
  ])
  const [isSyncingSelection, setIsSyncingSelection] = useState(false)

  const getStatusBadgeVariant = (state: UsageHistorySyncState | undefined) => {
    return state === USAGE_HISTORY_SYNC_STATES.Success
      ? USAGE_HISTORY_SYNC_STATES.Success
      : state === USAGE_HISTORY_SYNC_STATES.Unsupported
        ? "warning"
        : state === USAGE_HISTORY_SYNC_STATES.Error
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
            disabled={isSyncingAll || isSyncingSelection}
          />
        ),
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: CheckboxState) =>
              row.toggleSelected(!!value)
            }
            aria-label={t("syncTab.table.selectRow", {
              name: row.original.accountName,
            })}
            data-testid={`${BASIC_SETTINGS_TEST_IDS.usageHistorySyncAccountCheckboxPrefix}-${row.original.id}`}
            disabled={isSyncingAll || isSyncingSelection}
          />
        ),
        size: 16,
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "accountName",
        header: t("syncTab.table.columns.account"),
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <div
            className="max-w-[clamp(3.5rem,calc(100cqw_-_10rem),16.25rem)] truncate text-sm font-medium"
            title={row.original.accountName}
          >
            {row.original.accountName}
          </div>
        ),
      },
      {
        accessorKey: "state",
        header: t("syncTab.table.columns.state"),
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <Badge
            variant={getStatusBadgeVariant(row.original.state)}
            className="shrink-0 whitespace-nowrap"
          >
            {getUsageHistorySyncStateLabel(t, row.original.state)}
          </Badge>
        ),
      },
      {
        id: "lastSyncAt",
        header: t("syncTab.table.columns.lastSyncAt"),
        accessorFn: (row) => row.lastSyncAtMs ?? 0,
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <div className="text-xs text-muted-foreground">
            {row.original.state === undefined
              ? "—"
              : row.original.lastSyncAtLabel}
          </div>
        ),
      },
      {
        id: "message",
        header: t("syncTab.table.columns.message"),
        cell: ({ row }: { row: Row<UsageHistoryAccountRow> }) => (
          <div className="space-y-density-1">
            {row.original.lastError && (
              <div className="text-xs text-destructive-text">
                {row.original.lastError}
              </div>
            )}
            {row.original.lastWarning && (
              <div className="text-xs text-warning-text">
                {row.original.lastWarning}
              </div>
            )}
            {!row.original.lastError && !row.original.lastWarning && (
              <div className="text-xs text-muted-foreground">
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
  }, [isSyncingAll, isSyncingSelection, onSyncAccounts, syncingAccountIds, t])

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
  const hasSyncingSelectedAccount = selectedAccountIds.some((id) =>
    syncingAccountIds.has(id),
  )

  const isInitialLoading = isLoading && rows.length === 0

  const handleSyncSelection = async () => {
    setIsSyncingSelection(true)
    try {
      await onSyncAccounts(selectedAccountIds)
    } finally {
      setIsSyncingSelection(false)
    }
  }

  return (
    <div className="space-y-density-3">
      <div className="flex flex-wrap items-center justify-between gap-density-2">
        <div className="text-xs text-muted-foreground">
          {t("syncTab.table.selectedCount", {
            count: selectedAccountIds.length,
          })}
        </div>
        <div className="flex flex-wrap gap-density-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleSyncSelection()}
            disabled={
              !selectedAccountIds.length ||
              isSyncingAll ||
              hasSyncingSelectedAccount
            }
            loading={isSyncingSelection}
            data-testid={BASIC_SETTINGS_TEST_IDS.usageHistorySyncSelectedButton}
          >
            {isSyncingSelection
              ? t("syncTab.actions.syncing")
              : t("syncTab.actions.syncSelected")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.resetRowSelection()}
            disabled={
              !selectedAccountIds.length || isSyncingAll || isSyncingSelection
            }
          >
            {t("syncTab.actions.clearSelection")}
          </Button>
        </div>
      </div>

      <div className="@container overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "px-1.5 whitespace-nowrap sm:px-3",
                      header.column.id === "actions" &&
                        cn(
                          "sticky right-0 border-l bg-background",
                          Z_INDEX.tableStickyHeader,
                        ),
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
            {isInitialLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32">
                  <div className="text-sm text-muted-foreground">
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
                        "px-1.5 py-density-3 sm:px-3",
                        cell.column.id === "actions" &&
                          cn(
                            "sticky right-0 border-l bg-background group-hover/row:bg-muted group-has-aria-expanded/row:bg-muted group-data-[state=selected]/row:bg-muted",
                            Z_INDEX.tableStickyCell,
                          ),
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
                  <div className="text-sm text-muted-foreground">
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
