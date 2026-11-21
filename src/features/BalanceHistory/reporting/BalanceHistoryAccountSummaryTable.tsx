import {
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from "@tanstack/react-table"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import { Button, Checkbox } from "~/components/ui"
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { useIsMobile } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import { compareDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
} from "~/services/amounts/financialConstants"
import { FINANCIAL_HISTORY_ACTIVITY_KINDS } from "~/services/history/dailyBalanceHistory/constants"
import type { FinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import { formatMoneyFixed } from "~/utils/core/money"

import {
  BALANCE_HISTORY_REFERENCE_MODES,
  BALANCE_HISTORY_SUMMARY_COLUMNS,
  buildNativeHistorySortOptions,
  type BALANCE_HISTORY_REFERENCE_AMOUNT_COLUMNS,
} from "./accountSummary"
import type { BalanceHistoryAccountSummaryRow } from "./accountSummary"
import { FinancialHistoryAmounts } from "./FinancialHistoryAmounts"
import { getFinancialHistoryPresentation } from "./financialHistoryPresentation"
import { FinancialHistoryRecords } from "./FinancialHistoryRecords"

export type { BalanceHistoryAccountSummaryRow } from "./accountSummary"

const DEFAULT_SORTING: SortingState = [
  { id: BALANCE_HISTORY_SUMMARY_COLUMNS.Account, desc: false },
]

interface BalanceHistoryAccountSummaryTableProps {
  rows: BalanceHistoryAccountSummaryRow[]
  isLoading: boolean
  currencySymbol: string
  showEstimatedIncome?: boolean
  linkAccounts?: boolean
  financialSeries?: FinancialHistorySeries[]
  showReferenceColumns?: boolean
}

/**
 * Sorts nullable numeric values.
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
  showEstimatedIncome = false,
  linkAccounts = true,
  financialSeries,
  showReferenceColumns = true,
}: BalanceHistoryAccountSummaryTableProps) {
  const { t, i18n } = useTranslation(["balanceHistory", "account"])
  const isInitialLoading = isLoading && rows.length === 0
  const isMobile = useIsMobile()
  const [selectedKey, setSelectedKey] = useState<string>()
  const [referenceVisibility, setReferenceVisibility] = useState<
    Partial<
      Record<
        (typeof BALANCE_HISTORY_REFERENCE_MODES)[keyof typeof BALANCE_HISTORY_REFERENCE_MODES],
        boolean
      >
    >
  >({})
  const tableId = useId()
  const checkboxId = useId()
  const tableRef = useRef<HTMLDivElement>(null)
  const selected = financialSeries?.find((item) => item.key === selectedKey)
  const presentation = useMemo(
    () =>
      getFinancialHistoryPresentation(financialSeries ?? [], t, i18n.language),
    [financialSeries, i18n.language, t],
  )
  const recordsTitle = selected
    ? `${rows.find((row) => row.id === selected.accountId)?.label ?? selected.accountId} · ${presentation.optionLabel(selected)}`
    : ""

  const [sorting, setSorting] = useState(DEFAULT_SORTING)
  const [nativeSorting, setNativeSorting] = useState<SortingState[number]>()
  const nativeSortOptions = useMemo(
    () =>
      buildNativeHistorySortOptions(
        financialSeries ?? [],
        rows,
        presentation.optionLabel,
      ),
    [financialSeries, presentation, rows],
  )
  const lastPrimarySorting = useRef(sorting)
  const hasNativeBalances = Boolean(financialSeries?.length)
  const hasNativeRecords =
    hasNativeBalances || rows.some((row) => row.nativeActivity?.length)
  const referenceMode = hasNativeRecords
    ? BALANCE_HISTORY_REFERENCE_MODES.Mixed
    : BALANCE_HISTORY_REFERENCE_MODES.Archive
  const showReferences =
    showReferenceColumns &&
    (referenceVisibility[referenceMode] ?? !hasNativeRecords)
  const showReferenceFallbacks =
    showReferenceColumns && !showReferences && hasNativeRecords
  const primaryColumns = useMemo(
    () =>
      new Set<string>([
        BALANCE_HISTORY_SUMMARY_COLUMNS.Account,
        BALANCE_HISTORY_SUMMARY_COLUMNS.FinancialBalances,
        BALANCE_HISTORY_SUMMARY_COLUMNS.NativeActivity,
        BALANCE_HISTORY_SUMMARY_COLUMNS.SnapshotCoverage,
        ...(!hasNativeBalances
          ? [BALANCE_HISTORY_SUMMARY_COLUMNS.EndBalance]
          : []),
      ]),
    [hasNativeBalances],
  )

  const columns = useMemo<
    ColumnDef<BalanceHistoryAccountSummaryRow, unknown>[]
  >(() => {
    const seriesByAccount = new Map<string, FinancialHistorySeries[]>()
    for (const item of financialSeries ?? []) {
      const items = seriesByAccount.get(item.accountId) ?? []
      items.push(item)
      seriesByAccount.set(item.accountId, items)
    }
    const formatMoney = (value: number | null) =>
      value === null ? "-" : `${currencySymbol}${formatMoneyFixed(value)}`
    const referenceMoneyColumn = (
      key: (typeof BALANCE_HISTORY_REFERENCE_AMOUNT_COLUMNS)[number],
      header: string,
    ): ColumnDef<BalanceHistoryAccountSummaryRow, unknown> => ({
      accessorKey: key,
      header,
      cell: ({ row }) => (
        <div className="text-sm whitespace-nowrap tabular-nums">
          {formatMoney(row.original[key])}
        </div>
      ),
      sortingFn: sortNullableNumber,
    })
    const referenceLabel = (column: string) =>
      `${t("legacy.title")} · ${t(`table.columns.${column}`)}`
    const activityEntries = (row: BalanceHistoryAccountSummaryRow) => {
      const entries = [...(row.nativeActivity ?? [])]
      if (showReferenceFallbacks) {
        for (const { kind, value, column } of [
          {
            kind: FINANCIAL_HISTORY_ACTIVITY_KINDS.Income,
            value: row.incomeTotal,
            column: BALANCE_HISTORY_SUMMARY_COLUMNS.IncomeTotal,
          },
          {
            kind: FINANCIAL_HISTORY_ACTIVITY_KINDS.Consumption,
            value: row.outcomeTotal,
            column: BALANCE_HISTORY_SUMMARY_COLUMNS.OutcomeTotal,
          },
        ]) {
          if (value !== null && !entries.some((entry) => entry.kind === kind))
            entries.push({
              key: `reference:${kind}`,
              label: referenceLabel(column),
              amount: formatMoney(value),
              kind,
            })
        }
      }
      return entries
    }

    const snapshotCoverageColumn: ColumnDef<
      BalanceHistoryAccountSummaryRow,
      unknown
    > = {
      id: BALANCE_HISTORY_SUMMARY_COLUMNS.SnapshotCoverage,
      header: t("table.columns.snapshotCoverage"),
      accessorFn: (row) =>
        row.totalDays ? row.snapshotDays / row.totalDays : 0,
      cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
        <div className="text-xs text-muted-foreground">
          {t("table.coverageFormat", {
            covered: row.original.snapshotDays,
            total: row.original.totalDays,
          })}
        </div>
      ),
    }
    return [
      {
        accessorKey: BALANCE_HISTORY_SUMMARY_COLUMNS.Account,
        header: t("table.columns.account"),
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) =>
          linkAccounts ? (
            <AccountLinkButton
              accountId={row.original.id}
              accountName={row.original.label}
              className="h-auto min-h-0 max-w-[260px] min-w-0 justify-start p-0 text-sm font-medium"
            />
          ) : (
            <span>{row.original.label}</span>
          ),
      },
      ...(seriesByAccount.size
        ? [
            {
              id: BALANCE_HISTORY_SUMMARY_COLUMNS.FinancialBalances,
              header: t("native.amountsTitle"),
              cell: ({
                row,
              }: {
                row: Row<BalanceHistoryAccountSummaryRow>
              }) => {
                const items = seriesByAccount.get(row.original.id) ?? []
                const hasNativeBalance = items.some(
                  ({ position, observations }) =>
                    position.asset.kind !== ASSET_KINDS.Unknown &&
                    (position.role === BALANCE_ROLES.Available ||
                      position.role === BALANCE_ROLES.Ledger) &&
                    observations.at(-1)?.value != null,
                )
                const showFallback =
                  showReferenceFallbacks &&
                  !hasNativeBalance &&
                  row.original.endBalance !== null
                return (
                  <div className="space-y-1">
                    {(items.length > 0 || !showFallback) && (
                      <FinancialHistoryAmounts
                        items={items}
                        presentation={presentation}
                        onOpen={setSelectedKey}
                        selectedKey={selectedKey}
                      />
                    )}
                    {showFallback && (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs [overflow-wrap:anywhere]">
                        <span className="text-muted-foreground">
                          {referenceLabel(
                            BALANCE_HISTORY_SUMMARY_COLUMNS.EndBalance,
                          )}
                        </span>
                        <span className="font-medium tabular-nums">
                          {formatMoney(row.original.endBalance)}
                        </span>
                      </div>
                    )}
                  </div>
                )
              },
            } satisfies ColumnDef<BalanceHistoryAccountSummaryRow, unknown>,
          ]
        : []),
      ...(rows.some((row) => activityEntries(row).length)
        ? [
            {
              id: BALANCE_HISTORY_SUMMARY_COLUMNS.NativeActivity,
              header: t("native.activityTitle"),
              cell: ({
                row,
              }: {
                row: Row<BalanceHistoryAccountSummaryRow>
              }) => {
                const entries = activityEntries(row.original)
                return entries.length ? (
                  <ul className="space-y-1 text-xs">
                    {entries.map(({ key, label, amount, partial }) => (
                      <li
                        key={key}
                        className="flex flex-wrap items-baseline justify-between gap-x-2 [overflow-wrap:anywhere]"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">
                          {amount}
                          {partial && (
                            <span className="ml-1 whitespace-nowrap text-muted-foreground">
                              {t("keyManagement:financial.partial")}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              },
            } satisfies ColumnDef<BalanceHistoryAccountSummaryRow, unknown>,
          ]
        : []),
      ...(showReferenceColumns
        ? ([
            referenceMoneyColumn(
              BALANCE_HISTORY_SUMMARY_COLUMNS.StartBalance,
              t("table.columns.startBalance"),
            ),
            {
              accessorKey: BALANCE_HISTORY_SUMMARY_COLUMNS.EndBalance,
              header: t("table.columns.endBalance"),
              cell: ({
                row,
              }: {
                row: Row<BalanceHistoryAccountSummaryRow>
              }) => (
                <div className="text-sm whitespace-nowrap tabular-nums">
                  {showReferenceFallbacks &&
                    row.original.endBalance !== null && (
                      <span className="block text-xs text-muted-foreground">
                        {referenceLabel(
                          BALANCE_HISTORY_SUMMARY_COLUMNS.EndBalance,
                        )}
                      </span>
                    )}
                  <span>{formatMoney(row.original.endBalance)}</span>
                </div>
              ),
              sortingFn: sortNullableNumber,
            },
            referenceMoneyColumn(
              BALANCE_HISTORY_SUMMARY_COLUMNS.NetTotal,
              t("table.columns.rangeNet"),
            ),
            referenceMoneyColumn(
              BALANCE_HISTORY_SUMMARY_COLUMNS.IncomeTotal,
              t("table.columns.incomeTotal"),
            ),
            ...(showEstimatedIncome
              ? [
                  referenceMoneyColumn(
                    BALANCE_HISTORY_SUMMARY_COLUMNS.EstimatedIncomeTotal,
                    t("table.columns.estimatedIncomeTotal"),
                  ),
                ]
              : []),
            referenceMoneyColumn(
              BALANCE_HISTORY_SUMMARY_COLUMNS.OutcomeTotal,
              t("table.columns.outcomeTotal"),
            ),
            snapshotCoverageColumn,
            {
              id: BALANCE_HISTORY_SUMMARY_COLUMNS.CashflowCoverage,
              header: t("table.columns.cashflowCoverage"),
              accessorFn: (row) =>
                row.totalDays ? row.cashflowDays / row.totalDays : 0,
              cell: ({
                row,
              }: {
                row: Row<BalanceHistoryAccountSummaryRow>
              }) => (
                <div className="text-xs text-muted-foreground">
                  {t("table.coverageFormat", {
                    covered: row.original.cashflowDays,
                    total: row.original.totalDays,
                  })}
                </div>
              ),
            },
          ] satisfies Array<
            ColumnDef<BalanceHistoryAccountSummaryRow, unknown>
          >)
        : [snapshotCoverageColumn]),
    ]
  }, [
    currencySymbol,
    financialSeries,
    presentation,
    rows,
    selectedKey,
    linkAccounts,
    showEstimatedIncome,
    showReferenceColumns,
    showReferenceFallbacks,
    t,
  ])

  const { columnVisibility, hasOptionalReferences } = useMemo(() => {
    const available = Object.entries({
      startBalance: rows.some((row) => row.startBalance !== null),
      endBalance: rows.some((row) => row.endBalance !== null),
      netTotal: rows.some((row) => row.netTotal !== null),
      incomeTotal: rows.some((row) => row.incomeTotal !== null),
      estimatedIncomeTotal:
        showEstimatedIncome &&
        rows.some((row) => row.estimatedIncomeTotal !== null),
      outcomeTotal: rows.some((row) => row.outcomeTotal !== null),
      cashflowCoverage: rows.some((row) => row.cashflowDays > 0),
    })
    return {
      columnVisibility: Object.fromEntries(
        available.map(([id, hasValues]) => [
          id,
          showReferenceColumns &&
            hasValues &&
            (showReferences || primaryColumns.has(id)),
        ]),
      ),
      hasOptionalReferences:
        showReferenceColumns &&
        available.some(
          ([id, hasValues]) => hasValues && !primaryColumns.has(id),
        ),
    }
  }, [
    primaryColumns,
    rows,
    showEstimatedIncome,
    showReferenceColumns,
    showReferences,
  ])

  const effectiveSorting = useMemo(() => {
    const visible = sorting.filter(({ id }) => columnVisibility[id] !== false)
    return visible.length ? visible : DEFAULT_SORTING
  }, [columnVisibility, sorting])

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting: effectiveSorting,
      columnVisibility,
    },
    onSortingChange: (update) => {
      setNativeSorting(undefined)
      const next = functionalUpdate(update, effectiveSorting)
      if (next.every(({ id }) => primaryColumns.has(id))) {
        lastPrimarySorting.current = next
      }
      setSorting(next)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
  })

  const nativeOrder = nativeSorting && nativeSortOptions.get(nativeSorting.id)
  const sortedRows = table.getRowModel().rows
  const visibleRows = nativeOrder
    ? [...sortedRows].sort((left, right) => {
        const a = nativeOrder.values.get(left.id)
        const b = nativeOrder.values.get(right.id)
        if (a === undefined) return b === undefined ? 0 : 1
        if (b === undefined) return -1
        return compareDecimal(a, b) * (nativeSorting!.desc ? -1 : 1)
      })
    : sortedRows
  const visibleColumns = table.getVisibleLeafColumns().length
  const regularSortOptions = isMobile
    ? table
        .getVisibleLeafColumns()
        .filter(
          (column) =>
            column.getCanSort() && typeof column.columnDef.header === "string",
        )
    : []
  const sortedColumn = table.getColumn(effectiveSorting[0]!.id)
  return (
    <div ref={tableRef} tabIndex={-1} className="min-w-0 space-y-density-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-density-1">
        <h2 className="text-sm font-medium">{t("table.title")}</h2>
        {(nativeSortOptions.size > 0 || regularSortOptions.length > 0) &&
          rows.length > 1 && (
            <div className="flex min-w-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={t("account:list.sortMenu")}
                    className="min-w-0"
                  >
                    {nativeOrder?.label ??
                      (isMobile &&
                      typeof sortedColumn?.columnDef.header === "string"
                        ? sortedColumn.columnDef.header
                        : t("account:list.sortMenu"))}
                    <ChevronDown aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-w-[min(22rem,calc(100vw-1rem))]"
                >
                  <DropdownMenuRadioGroup
                    value={
                      nativeOrder ? nativeSorting?.id : effectiveSorting[0]?.id
                    }
                    onValueChange={(id) => {
                      if (nativeSortOptions.has(id))
                        setNativeSorting({ id, desc: true })
                      else table.getColumn(id)?.toggleSorting()
                    }}
                  >
                    {regularSortOptions.map(({ id, columnDef }) => (
                      <DropdownMenuRadioItem key={id} value={id}>
                        {columnDef.header as string}
                      </DropdownMenuRadioItem>
                    ))}
                    {[...nativeSortOptions].map(([id, { label }]) => (
                      <DropdownMenuRadioItem key={id} value={id}>
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {(nativeOrder || isMobile) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t("account:list.toggleSortOrder")}
                  onClick={() => {
                    if (nativeSorting && nativeOrder)
                      setNativeSorting({
                        ...nativeSorting,
                        desc: !nativeSorting.desc,
                      })
                    else sortedColumn?.toggleSorting()
                  }}
                >
                  {(
                    nativeOrder
                      ? nativeSorting?.desc
                      : effectiveSorting[0]?.desc
                  ) ? (
                    <ChevronDown aria-hidden />
                  ) : (
                    <ChevronUp aria-hidden />
                  )}
                </Button>
              )}
            </div>
          )}
        {hasOptionalReferences && (
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkboxId}
              aria-controls={tableId}
              checked={showReferences}
              onCheckedChange={(checked) => {
                if (
                  !checked &&
                  effectiveSorting.some(({ id }) => !primaryColumns.has(id))
                ) {
                  const primarySorting = effectiveSorting.filter(({ id }) =>
                    primaryColumns.has(id),
                  )
                  setSorting(
                    primarySorting.length
                      ? primarySorting
                      : lastPrimarySorting.current,
                  )
                }
                setReferenceVisibility((current) => ({
                  ...current,
                  [referenceMode]: checked === true,
                }))
              }}
            />
            <label htmlFor={checkboxId} className="cursor-pointer text-xs">
              {t(isMobile ? "legacy.accountDetails" : "legacy.showColumns")}
            </label>
          </div>
        )}
      </div>
      {isMobile ? (
        visibleRows.length > 0 ? (
          <ul id={tableId} className="divide-y divide-border">
            {visibleRows.map((row) => {
              const cells = row.getAllCells()
              const render = (id: string) => {
                const cell = cells.find(({ column }) => column.id === id)
                return (
                  cell &&
                  flexRender(cell.column.columnDef.cell, cell.getContext())
                )
              }
              const referenceCells = row
                .getVisibleCells()
                .filter(
                  (cell) =>
                    !primaryColumns.has(cell.column.id) &&
                    (cell.column.id ===
                    BALANCE_HISTORY_SUMMARY_COLUMNS.CashflowCoverage
                      ? row.original.cashflowDays > 0
                      : cell.getValue() != null),
                )
              return (
                <li
                  key={row.id}
                  className="space-y-density-2 py-density-3 first:pt-density-1 last:pb-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-medium [overflow-wrap:anywhere]">
                    {render(BALANCE_HISTORY_SUMMARY_COLUMNS.Account)}
                    <span className="flex flex-wrap items-baseline gap-x-1 text-xs font-normal text-muted-foreground">
                      <span>{t("table.columns.snapshotCoverage")}</span>
                      <span>
                        {t("table.coverageFormat", {
                          covered: row.original.snapshotDays,
                          total: row.original.totalDays,
                        })}
                      </span>
                    </span>
                  </div>
                  {render(
                    hasNativeBalances
                      ? BALANCE_HISTORY_SUMMARY_COLUMNS.FinancialBalances
                      : BALANCE_HISTORY_SUMMARY_COLUMNS.EndBalance,
                  )}
                  {row.original.nativeActivity?.length ||
                  (showReferenceFallbacks &&
                    (row.original.incomeTotal !== null ||
                      row.original.outcomeTotal !== null))
                    ? render(BALANCE_HISTORY_SUMMARY_COLUMNS.NativeActivity)
                    : null}
                  {referenceCells.length > 0 && (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-density-2 [overflow-wrap:anywhere]">
                      {referenceCells.map((cell) => (
                        <div key={cell.id}>
                          <dt className="text-xs text-muted-foreground">
                            {typeof cell.column.columnDef.header === "string" &&
                              cell.column.columnDef.header}
                          </dt>
                          <dd className="tabular-nums">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-density-4 text-center text-sm text-muted-foreground">
            {t(isInitialLoading ? "table.loading" : "table.empty")}
          </p>
        )
      ) : (
        <div id={tableId}>
          <Table>
            {showReferences && hasOptionalReferences && (
              <TableCaption className="mt-0 mb-density-2 caption-top text-start text-xs">
                {t("legacy.columnsHint")}
              </TableCaption>
            )}
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const sort = header.column.getIsSorted()
                    const SortIcon = sort === "asc" ? ChevronUp : ChevronDown
                    return (
                      <TableHead
                        key={header.id}
                        aria-sort={
                          header.column.getSortIndex() === 0 && sort
                            ? sort === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                        className={cn(
                          "text-xs [overflow-wrap:normal]",
                          header.id ===
                            BALANCE_HISTORY_SUMMARY_COLUMNS.Account &&
                            "min-w-44",
                          header.id ===
                            BALANCE_HISTORY_SUMMARY_COLUMNS.NativeActivity &&
                            "min-w-56",
                          !showReferences &&
                            header.id ===
                              BALANCE_HISTORY_SUMMARY_COLUMNS.FinancialBalances &&
                            "w-2/5",
                        )}
                        style={
                          showReferences
                            ? { width: header.getSize() }
                            : undefined
                        }
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="flex w-full items-center gap-1 rounded-sm text-start hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {sort && (
                              <SortIcon
                                aria-hidden="true"
                                className="size-3.5 shrink-0 opacity-80"
                              />
                            )}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns}
                    className="h-32 text-center"
                  >
                    <div className="text-sm text-muted-foreground">
                      {t("table.loading")}
                    </div>
                  </TableCell>
                </TableRow>
              ) : visibleRows.length ? (
                visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "py-density-3",
                          cell.column.id ===
                            BALANCE_HISTORY_SUMMARY_COLUMNS.NativeActivity &&
                            "min-w-56",
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
                    colSpan={visibleColumns}
                    className="h-32 text-center"
                  >
                    <div className="text-sm text-muted-foreground">
                      {t("table.empty")}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(undefined)
        }}
      >
        {selected && (
          <DialogContent
            className="max-h-[85dvh] min-w-0 overflow-auto sm:max-w-2xl"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              const trigger = Array.from(
                tableRef.current?.querySelectorAll<HTMLButtonElement>(
                  "[data-balance-history-record]",
                ) ?? [],
              ).find(
                (button) =>
                  button.dataset.balanceHistoryRecord === selected.key,
              )
              const target = trigger ?? tableRef.current
              target?.focus()
            }}
          >
            <DialogTitle className="pr-5">{recordsTitle}</DialogTitle>
            <FinancialHistoryRecords
              item={selected}
              title={recordsTitle}
              showNetInflow={showEstimatedIncome}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
