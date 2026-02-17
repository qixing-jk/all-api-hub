import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from "@tanstack/react-table"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { cn } from "~/lib/utils"
import { formatMoneyFixed } from "~/utils/money"

export type BalanceHistoryAccountSummaryRow = {
  id: string
  label: string
  startBalance: number | null
  endBalance: number | null
  netTotal: number | null
  incomeTotal: number | null
  outcomeTotal: number | null
  snapshotDays: number
  cashflowDays: number
  totalDays: number
}

interface BalanceHistoryAccountSummaryTableProps {
  rows: BalanceHistoryAccountSummaryRow[]
  isLoading: boolean
  currencySymbol: string
}

/**
 *
 */
function sortNullableNumber<RowType extends Record<string, unknown>>(
  rowA: Row<RowType>,
  rowB: Row<RowType>,
  columnId: string,
): number {
  const a = rowA.getValue<number | null>(columnId)
  const b = rowB.getValue<number | null>(columnId)

  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

/**
 * Unified multi-account summary table for the Balance History options page.
 */
export default function BalanceHistoryAccountSummaryTable({
  rows,
  isLoading,
  currencySymbol,
}: BalanceHistoryAccountSummaryTableProps) {
  const { t } = useTranslation("balanceHistory")

  const [sorting, setSorting] = useState<SortingState>([
    { id: "label", desc: false },
  ])

  const columns = useMemo<
    ColumnDef<BalanceHistoryAccountSummaryRow, unknown>[]
  >(() => {
    const formatMoney = (value: number | null) =>
      value === null ? "-" : `${currencySymbol}${formatMoneyFixed(value)}`

    return [
      {
        accessorKey: "label",
        header: t("table.columns.account"),
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <AccountLinkButton
            accountId={row.original.id}
            accountName={row.original.label}
            className="h-auto max-w-[260px] min-w-0 justify-start p-0 text-sm font-medium"
          />
        ),
      },
      {
        accessorKey: "startBalance",
        header: t("table.columns.startBalance"),
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <div className="text-sm">
            {formatMoney(row.original.startBalance)}
          </div>
        ),
        sortingFn: sortNullableNumber,
      },
      {
        accessorKey: "endBalance",
        header: t("table.columns.endBalance"),
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <div className="text-sm">{formatMoney(row.original.endBalance)}</div>
        ),
        sortingFn: sortNullableNumber,
      },
      {
        accessorKey: "netTotal",
        header: t("table.columns.rangeNet"),
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <div className="text-sm">{formatMoney(row.original.netTotal)}</div>
        ),
        sortingFn: sortNullableNumber,
      },
      {
        accessorKey: "incomeTotal",
        header: t("table.columns.incomeTotal"),
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <div className="text-sm">{formatMoney(row.original.incomeTotal)}</div>
        ),
        sortingFn: sortNullableNumber,
      },
      {
        accessorKey: "outcomeTotal",
        header: t("table.columns.outcomeTotal"),
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <div className="text-sm">
            {formatMoney(row.original.outcomeTotal)}
          </div>
        ),
        sortingFn: sortNullableNumber,
      },
      {
        id: "snapshotCoverage",
        header: t("table.columns.snapshotCoverage"),
        accessorFn: (row) =>
          row.totalDays ? row.snapshotDays / row.totalDays : 0,
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
            {t("table.coverageFormat", {
              covered: row.original.snapshotDays,
              total: row.original.totalDays,
            })}
          </div>
        ),
      },
      {
        id: "cashflowCoverage",
        header: t("table.columns.cashflowCoverage"),
        accessorFn: (row) =>
          row.totalDays ? row.cashflowDays / row.totalDays : 0,
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
            {t("table.coverageFormat", {
              covered: row.original.cashflowDays,
              total: row.original.totalDays,
            })}
          </div>
        ),
      },
    ]
  }, [currencySymbol, t])

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
  })

  return (
    <div className="border-border bg-background overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} style={{ width: header.getSize() }}>
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted() === "asc" && (
                        <ChevronUp className="h-3.5 w-3.5 opacity-60" />
                      )}
                      {header.column.getIsSorted() === "desc" && (
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      )}
                    </button>
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center">
                <div className="text-muted-foreground text-sm">
                  {t("table.loading")}
                </div>
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn("py-3")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center">
                <div className="text-muted-foreground text-sm">
                  {t("table.empty")}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
