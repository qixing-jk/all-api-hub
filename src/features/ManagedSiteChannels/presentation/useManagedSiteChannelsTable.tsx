import {
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type Row,
  type Updater,
} from "@tanstack/react-table"
import { useMemo } from "react"

import { ExternalUrlText } from "~/components/ui"
import { Badge } from "~/components/ui/badge"
import { Checkbox } from "~/components/ui/checkbox"
import { cn } from "~/lib/utils"

import RowActions from "../components/RowActions"
import {
  getManagedSiteChannelRowActionsButtonTestId,
  getManagedSiteChannelRowDeleteActionTestId,
  getManagedSiteChannelRowEditActionTestId,
  getManagedSiteChannelRowSelectTestId,
} from "../testIds"
import type {
  ManagedChannelsCallbacks,
  ManagedChannelsCell,
  ManagedChannelsColumnAccessor,
  ManagedChannelsLabels,
  ManagedChannelsPagination,
  ManagedChannelsPresentationState,
  ManagedChannelsRowViewModel,
  ManagedChannelsSorting,
} from "./contracts"
import {
  MANAGED_CHANNELS_CELL_KINDS,
  MANAGED_CHANNELS_CELL_TONES,
  MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS,
  MANAGED_CHANNELS_COLUMN_FACET_KINDS,
  MANAGED_CHANNELS_COLUMN_RENDERERS,
  MANAGED_CHANNELS_ROUTE_FILTER_KINDS,
  MANAGED_CHANNELS_ROUTE_QUERY_KEYS,
  MANAGED_CHANNELS_SORT_DIRECTIONS,
} from "./contracts"

const getUpdatedState = <T,>(updater: Updater<T>, current: T) =>
  typeof updater === "function"
    ? (updater as (previous: T) => T)(current)
    : updater

const getAccessorValue = (
  row: ManagedChannelsRowViewModel,
  accessor: ManagedChannelsColumnAccessor | undefined,
): string | number | ManagedChannelsCell | undefined => {
  if (!accessor) return undefined
  switch (accessor.kind) {
    case MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.DisplayIdentifier:
      return row.displayIdentifier
    case MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.DisplayIdentifierSort:
      return row.displayIdentifierSort
    case MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.Name:
      return row.name
    case MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.Cell:
      return row.cells[accessor.key]
    case MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.CellSortValue: {
      const cell = row.cells[accessor.key]
      return !cell || ("missing" in cell && cell.missing)
        ? undefined
        : cell.sortValue
    }
  }
}

const getExactFilterValue = (
  row: ManagedChannelsRowViewModel,
  accessor: ManagedChannelsColumnAccessor | undefined,
) => {
  const value = getAccessorValue(row, accessor)
  if (!value || typeof value !== "object") return value
  return value.kind === MANAGED_CHANNELS_CELL_KINDS.Groups
    ? value.values.join(",")
    : value.value
}

/** Renders a controlled cell value without exposing controller identities. */
function CellValue({ cell }: { cell?: ManagedChannelsCell }) {
  if (!cell) {
    return <span className="text-muted-foreground">—</span>
  }
  if (cell.kind === MANAGED_CHANNELS_CELL_KINDS.Groups) {
    if (!cell.values.length) {
      return <span className="text-muted-foreground">—</span>
    }
    return (
      <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
        {cell.values.slice(0, 3).map((value) => (
          <span key={value} className="rounded border px-1 py-0.5">
            {value}
          </span>
        ))}
        {cell.values.length > 3 && <span>+{cell.values.length - 3}</span>}
      </div>
    )
  }

  if (cell.kind === MANAGED_CHANNELS_CELL_KINDS.Status) {
    const config = {
      [MANAGED_CHANNELS_CELL_TONES.Default]: {
        variant: "secondary" as const,
        className: "",
      },
      [MANAGED_CHANNELS_CELL_TONES.Success]: {
        variant: "secondary" as const,
        className: "border-emerald-200 text-emerald-700",
      },
      [MANAGED_CHANNELS_CELL_TONES.Warning]: {
        variant: "outline" as const,
        className: "border-amber-200 text-amber-800",
      },
      [MANAGED_CHANNELS_CELL_TONES.Danger]: {
        variant: "destructive" as const,
        className: "",
      },
    }[cell.tone]
    return (
      <Badge
        variant={config.variant}
        className={cn("text-xs", config.className)}
      >
        {cell.value}
      </Badge>
    )
  }

  if (cell.missing) {
    return <span className="text-muted-foreground">—</span>
  }

  return <>{cell.value}</>
}

const multiColumnFilterFn: FilterFn<ManagedChannelsRowViewModel> = (
  row,
  _columnId,
  filterValue,
) => {
  const content = row.original.searchText.toLowerCase().trim()
  return content.includes(
    String(filterValue ?? "")
      .toLowerCase()
      .trim(),
  )
}

/** Sorts numeric status values before provider-owned text values. */
export function compareManagedSiteChannelStatusValues(a: string, b: string) {
  const numericA = Number(a)
  const numericB = Number(b)
  const isNumericA = a.trim() !== "" && Number.isFinite(numericA)
  const isNumericB = b.trim() !== "" && Number.isFinite(numericB)
  if (isNumericA && isNumericB) return numericA - numericB
  if (isNumericA !== isNumericB) return isNumericA ? -1 : 1
  return a.localeCompare(b)
}

/** Owns the controlled TanStack table assembly for the shared channel view. */
export function useManagedSiteChannelsTable({
  state,
  callbacks,
  labels,
  isDeleteReplayBlocked,
  isResourceInteractionBlocked,
}: {
  state: ManagedChannelsPresentationState
  callbacks: ManagedChannelsCallbacks
  labels: ManagedChannelsLabels
  isDeleteReplayBlocked: boolean
  isResourceInteractionBlocked: boolean
}) {
  const columns = useMemo<ColumnDef<ManagedChannelsRowViewModel, unknown>[]>(
    () =>
      state.columns.map((column) => {
        if (column.renderer === MANAGED_CHANNELS_COLUMN_RENDERERS.Select) {
          return {
            id: column.id,
            meta: {
              renderer: column.renderer,
              extension: column.extension,
            },
            header: ({ table }) => (
              <Checkbox
                checked={
                  table.getIsAllPageRowsSelected() ||
                  (table.getIsSomePageRowsSelected() && "indeterminate")
                }
                onCheckedChange={(value) =>
                  table.toggleAllPageRowsSelected(!!value)
                }
                aria-label={labels.selectAll}
              />
            ),
            cell: ({ row }: { row: Row<ManagedChannelsRowViewModel> }) => (
              <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label={labels.selectRow}
                data-testid={getManagedSiteChannelRowSelectTestId(
                  row.original.testToken,
                )}
              />
            ),
            size: 16,
            enableSorting: false,
            enableHiding: false,
          } satisfies ColumnDef<ManagedChannelsRowViewModel, unknown>
        }

        if (column.renderer === MANAGED_CHANNELS_COLUMN_RENDERERS.Actions) {
          return {
            id: column.id,
            meta: {
              renderer: column.renderer,
              extension: column.extension,
            },
            header: () => <span className="sr-only">{column.label}</span>,
            cell: ({ row }: { row: Row<ManagedChannelsRowViewModel> }) =>
              isResourceInteractionBlocked ? null : (
                <RowActions
                  rowKey={row.original.rowKey}
                  capabilities={{
                    ...row.original.capabilities,
                    canDelete:
                      row.original.capabilities.canDelete &&
                      !isDeleteReplayBlocked,
                  }}
                  onEdit={callbacks.onEdit}
                  onView={callbacks.onView}
                  onMigrate={callbacks.onMigrate}
                  onDelete={callbacks.onDelete}
                  onSync={callbacks.onSync}
                  onOpenSync={callbacks.onOpenSync}
                  onFilters={callbacks.onFilters}
                  showMigrationAction={state.migrationMode}
                  isSyncing={Boolean(row.original.isSyncing)}
                  labels={labels.rowActions}
                  testIds={{
                    trigger: getManagedSiteChannelRowActionsButtonTestId(
                      row.original.testToken,
                    ),
                    edit: getManagedSiteChannelRowEditActionTestId(
                      row.original.testToken,
                    ),
                    delete: getManagedSiteChannelRowDeleteActionTestId(
                      row.original.testToken,
                    ),
                  }}
                />
              ),
            size: column.size,
            enableSorting: false,
            enableHiding: false,
          } satisfies ColumnDef<ManagedChannelsRowViewModel, unknown>
        }

        return {
          id: column.id,
          meta: {
            renderer: column.renderer,
            extension: column.extension,
          },
          accessorFn: (row) =>
            getAccessorValue(row, column.sort?.accessor ?? column.accessor),
          header: column.label,
          cell: ({ row }: { row: Row<ManagedChannelsRowViewModel> }) => {
            if (
              column.renderer === MANAGED_CHANNELS_COLUMN_RENDERERS.Identifier
            ) {
              return (
                <span className="font-mono text-sm">
                  {row.original.displayIdentifier}
                </span>
              )
            }
            if (column.renderer === MANAGED_CHANNELS_COLUMN_RENDERERS.Channel) {
              return (
                <div>
                  <div className="leading-tight font-medium">
                    {row.original.name}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    <ExternalUrlText
                      value={row.original.baseURL}
                      className="truncate"
                    />
                  </div>
                </div>
              )
            }
            const cell = getAccessorValue(row.original, column.accessor)
            return (
              <span className={column.cellClassName}>
                <CellValue cell={typeof cell === "object" ? cell : undefined} />
              </span>
            )
          },
          filterFn:
            column.routeFilter?.kind ===
            MANAGED_CHANNELS_ROUTE_FILTER_KINDS.Exact
              ? (row, _columnId, value) => {
                  const queryValue = String(value ?? "").trim()
                  const candidateValue = getExactFilterValue(
                    row.original,
                    column.accessor,
                  )
                  return (
                    !queryValue ||
                    (candidateValue !== undefined &&
                      String(candidateValue).trim() === queryValue)
                  )
                }
              : column.renderer === MANAGED_CHANNELS_COLUMN_RENDERERS.Channel
                ? multiColumnFilterFn
                : column.facet?.kind ===
                    MANAGED_CHANNELS_COLUMN_FACET_KINDS.Status
                  ? (row, _columnId, value: string[]) => {
                      const facetValue = getAccessorValue(
                        row.original,
                        column.sort?.accessor ?? column.accessor,
                      )
                      return (
                        !value?.length || value.includes(String(facetValue))
                      )
                    }
                  : undefined,
          enableHiding: column.canHide,
          enableSorting: Boolean(column.sort),
          sortDescFirst:
            column.sort?.defaultDirection ===
            MANAGED_CHANNELS_SORT_DIRECTIONS.Descending,
          sortUndefined: column.sort?.missing,
          size: column.size,
        } satisfies ColumnDef<ManagedChannelsRowViewModel, unknown>
      }),
    [
      callbacks,
      isDeleteReplayBlocked,
      isResourceInteractionBlocked,
      labels,
      state.columns,
      state.migrationMode,
    ],
  )

  const channelIdRouteFilterColumn = state.columns.find(
    (column) =>
      column.routeFilter?.queryKey ===
      MANAGED_CHANNELS_ROUTE_QUERY_KEYS.ChannelId,
  )
  const channelColumn = state.columns.find(
    (column) => column.renderer === MANAGED_CHANNELS_COLUMN_RENDERERS.Channel,
  )
  const statusFacetColumn = state.columns.find(
    (column) =>
      column.facet?.kind === MANAGED_CHANNELS_COLUMN_FACET_KINDS.Status,
  )

  const columnFilters = useMemo(
    () => [
      ...(state.channelIdFilterValue && channelIdRouteFilterColumn
        ? [
            {
              id: channelIdRouteFilterColumn.id,
              value: state.channelIdFilterValue,
            },
          ]
        : []),
      ...(state.searchValue && channelColumn
        ? [{ id: channelColumn.id, value: state.searchValue }]
        : []),
      ...(state.statusFilterValues.length
        ? [{ id: statusFacetColumn?.id ?? "", value: state.statusFilterValues }]
        : []),
    ],
    [
      channelColumn,
      channelIdRouteFilterColumn,
      state.channelIdFilterValue,
      state.searchValue,
      state.statusFilterValues,
      statusFacetColumn,
    ],
  )

  const columnVisibility = useMemo(
    () =>
      Object.fromEntries(
        state.columns.map((column) => [
          column.id,
          column.visible ?? column.defaultVisible,
        ]),
      ),
    [state.columns],
  )

  const table = useReactTable({
    data: state.rows,
    columns,
    state: {
      sorting: state.sorting,
      columnFilters,
      columnVisibility,
      pagination: state.pagination,
      rowSelection: state.selectedRowKeys,
    },
    onSortingChange: (updater) =>
      callbacks.onSortingChange(
        getUpdatedState<ManagedChannelsSorting>(updater, state.sorting),
      ),
    onColumnVisibilityChange: (updater) =>
      callbacks.onColumnVisibilityChange(
        getUpdatedState(updater, columnVisibility),
      ),
    onPaginationChange: (updater) =>
      callbacks.onPaginationChange(
        getUpdatedState<ManagedChannelsPagination>(updater, state.pagination),
      ),
    onRowSelectionChange: (updater) =>
      callbacks.onSelectedRowKeysChange(
        getUpdatedState(updater, state.selectedRowKeys),
      ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    getRowId: (row) => row.rowKey,
  })

  const statusColumn = statusFacetColumn
    ? table.getColumn(statusFacetColumn.id)
    : undefined
  const statusCounts = statusColumn?.getFacetedUniqueValues()
  const uniqueStatusValues = Array.from(statusCounts?.keys() ?? [])
    .map(String)
    .sort(compareManagedSiteChannelStatusValues)
  const selectedRows = table.getSelectedRowModel().rows
  const filteredRows = table.getFilteredRowModel().rows

  return {
    table,
    columnCount: columns.length,
    statusCounts,
    uniqueStatusValues,
    selectedRows,
    filteredRows,
    selectedCount: selectedRows.length,
    filteredCount: filteredRows.length,
  }
}
