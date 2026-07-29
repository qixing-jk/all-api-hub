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
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Columns3,
  Filter,
  Layers,
  ListFilter,
  Plus,
  RefreshCcw,
  Settings,
  Trash2,
} from "lucide-react"
import { useMemo, useRef, type ReactNode } from "react"

import ManagedSiteConfigRequiredState from "~/components/ManagedSiteConfigRequiredState"
import { PageHeader } from "~/components/PageHeader"
import Tooltip from "~/components/Tooltip"
import {
  Badge,
  DestructiveConfirmDialog,
  ExternalUrlText,
  IconButton,
  Input,
} from "~/components/ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Label } from "~/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Spinner } from "~/components/ui/spinner"
import { cn } from "~/lib/utils"

import RowActions from "../components/RowActions"
import {
  getManagedSiteChannelRowActionsButtonTestId,
  getManagedSiteChannelRowDeleteActionTestId,
  getManagedSiteChannelRowEditActionTestId,
  getManagedSiteChannelRowSelectTestId,
  MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
  MANAGED_SITE_CHANNELS_REFRESH_STATES,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "../testIds"
import type {
  ManagedChannelsCallbacks,
  ManagedChannelsCapabilities,
  ManagedChannelsCell,
  ManagedChannelsColumnAccessor,
  ManagedChannelsLabels,
  ManagedChannelsPagination,
  ManagedChannelsPresentationState,
  ManagedChannelsRowViewModel,
  ManagedChannelsSorting,
} from "./contracts"
import { ManagedSiteChannelsTable } from "./ManagedSiteChannelsTable"

type ManagedSiteChannelsViewProps = {
  state: ManagedChannelsPresentationState
  capabilities: ManagedChannelsCapabilities
  callbacks: ManagedChannelsCallbacks
  labels: ManagedChannelsLabels
  title: string
  description: string
  configurationMissingDescription: string
  configurationSettingsTarget?: {
    tabId: "managedSite"
    anchor?: string
  }
  siteTypeLabel: string
  filterDialog?: ReactNode
}

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
    case "displayIdentifier":
      return row.displayIdentifier
    case "displayIdentifierSort":
      return row.displayIdentifierSort
    case "name":
      return row.name
    case "cell":
      return row.cells[accessor.key]
    case "cellSortValue": {
      const cell = row.cells[accessor.key]
      return !cell || ("missing" in cell && cell.missing)
        ? undefined
        : cell.sortValue
    }
  }
}

/** Renders a controlled cell value without exposing controller identities. */
function CellValue({ cell }: { cell?: ManagedChannelsCell }) {
  if (!cell) {
    return <span className="text-muted-foreground">—</span>
  }
  if (cell.kind === "groups") {
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

  if (cell.kind === "status") {
    const config = {
      default: { variant: "secondary" as const, className: "" },
      success: {
        variant: "secondary" as const,
        className: "border-emerald-200 text-emerald-700",
      },
      warning: {
        variant: "outline" as const,
        className: "border-amber-200 text-amber-800",
      },
      danger: { variant: "destructive" as const, className: "" },
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

/** Renders the shared managed-channel page for legacy and native controllers. */
export function ManagedSiteChannelsView({
  state,
  capabilities,
  callbacks,
  labels,
  title,
  description,
  configurationMissingDescription,
  configurationSettingsTarget,
  siteTypeLabel,
  filterDialog,
}: ManagedSiteChannelsViewProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const isDeleteReplayBlocked = state.deleteState.requiresRefresh
  const isResourceInteractionBlocked =
    state.isResourceInteractionBlocked ?? false
  const columns = useMemo<ColumnDef<ManagedChannelsRowViewModel, unknown>[]>(
    () =>
      state.columns.map((column) => {
        if (column.renderer === "select") {
          return {
            id: "select",
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

        if (column.renderer === "actions") {
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
                  displayName={row.original.name}
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
                  showNewApiOnlyActions={capabilities.showNewApiOnlyActions}
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
            if (column.renderer === "identifier") {
              return (
                <span className="font-mono text-sm">
                  {row.original.displayIdentifier}
                </span>
              )
            }
            if (column.renderer === "channel") {
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
            column.renderer === "identifier"
              ? (row, _columnId, value) =>
                  !String(value ?? "").trim() ||
                  row.original.displayIdentifier === String(value).trim()
              : column.renderer === "channel"
                ? multiColumnFilterFn
                : column.facet?.kind === "status"
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
          sortDescFirst: column.sort?.defaultDirection === "desc",
          sortUndefined: column.sort?.missing,
          size: column.size,
        } satisfies ColumnDef<ManagedChannelsRowViewModel, unknown>
      }),
    [
      callbacks,
      capabilities.showNewApiOnlyActions,
      isDeleteReplayBlocked,
      isResourceInteractionBlocked,
      labels,
      state.columns,
      state.migrationMode,
    ],
  )

  const identifierColumn = state.columns.find(
    (column) => column.renderer === "identifier",
  )
  const channelColumn = state.columns.find(
    (column) => column.renderer === "channel",
  )
  const statusFacetColumn = state.columns.find(
    (column) => column.facet?.kind === "status",
  )

  const columnFilters = useMemo(
    () => [
      ...(state.channelIdFilterValue
        ? [
            {
              id: identifierColumn?.id ?? "",
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
      identifierColumn,
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
    .sort((a, b) => {
      const numericA = Number(a)
      const numericB = Number(b)
      const isNumericA = a.trim() !== "" && Number.isFinite(numericA)
      const isNumericB = b.trim() !== "" && Number.isFinite(numericB)
      if (isNumericA && isNumericB) return numericA - numericB
      if (isNumericA !== isNumericB) return isNumericA ? -1 : 1
      return a.localeCompare(b)
    })
  const selectedRows = table.getSelectedRowModel().rows
  const filteredRows = table.getFilteredRowModel().rows
  const selectedCount = selectedRows.length
  const filteredCount = filteredRows.length
  const emptyTableMessage =
    state.searchValue.trim() ||
    state.channelIdFilterValue.trim() ||
    state.statusFilterValues.length
      ? labels.emptyFiltered
      : labels.emptyNoChannels
  const rowsPerPageOptions = [10, 25, 50, 100]
  const isInitialLoading =
    state.isLoading &&
    state.rows.length === 0 &&
    !state.failure &&
    !state.isConfigurationMissing

  const handleStatusChange = (
    checked: boolean | "indeterminate",
    value: string,
  ) => {
    const next =
      checked === true
        ? [...state.statusFilterValues, value]
        : state.statusFilterValues.filter((status) => status !== value)
    callbacks.onStatusFilterChange(Array.from(new Set(next)))
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={Layers}
        title={title}
        titleActions={
          <Tooltip content={labels.settings}>
            <IconButton
              type="button"
              size="sm"
              variant="outline"
              aria-label={labels.settings}
              onClick={callbacks.onSettings}
            >
              <Settings className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        }
        description={description}
        actions={
          <>
            {!state.isConfigurationMissing && capabilities.canRefresh ? (
              <Button
                variant="outline"
                aria-busy={state.isRefreshing}
                data-testid={MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton}
                {...{
                  [MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE]:
                    state.isRefreshing
                      ? MANAGED_SITE_CHANNELS_REFRESH_STATES.Loading
                      : MANAGED_SITE_CHANNELS_REFRESH_STATES.Idle,
                }}
                onClick={callbacks.onRefresh}
                leftIcon={
                  state.isRefreshing ? (
                    <Spinner aria-hidden="true" size="sm" variant="primary" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )
                }
              >
                {state.isRefreshing ? labels.cancelRefresh : labels.refresh}
              </Button>
            ) : null}
            {!state.isConfigurationMissing &&
            capabilities.canToggleMigration ? (
              <Button
                variant={state.migrationMode ? "default" : "outline"}
                onClick={callbacks.onToggleMigrationMode}
                data-testid={MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton}
                leftIcon={<ArrowRightLeft className="h-4 w-4" />}
              >
                <span>
                  {state.migrationMode
                    ? labels.exitMigrationMode
                    : labels.enterMigrationMode}
                </span>
                <Badge variant="warning" size="sm" className="shrink-0">
                  {labels.migrationBeta}
                </Badge>
              </Button>
            ) : null}
            {state.siteTypeOptions.length > 1 ? (
              <Select
                value={state.siteTypeValue}
                onValueChange={callbacks.onSiteTypeChange}
              >
                <SelectTrigger
                  className="w-auto min-w-[172px]"
                  size="sm"
                  aria-label={siteTypeLabel}
                >
                  <SelectValue placeholder={siteTypeLabel} />
                </SelectTrigger>
                <SelectContent>
                  {state.siteTypeOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </>
        }
      />

      {state.isConfigurationMissing ? (
        <ManagedSiteConfigRequiredState
          description={configurationMissingDescription}
          settingsTarget={configurationSettingsTarget}
          onRetry={callbacks.onRefresh}
          isRetrying={state.isRefreshing}
        />
      ) : (
        <>
          {state.failure ? (
            <Alert variant={state.failure.variant ?? "destructive"}>
              <AlertTitle>{state.failure.category}</AlertTitle>
              <AlertDescription>{state.failure.message}</AlertDescription>
            </Alert>
          ) : null}

          {state.deleteState.failure ? (
            <Alert
              role="alert"
              variant={state.deleteState.failure.variant ?? "destructive"}
            >
              <AlertTitle>{state.deleteState.failure.category}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{state.deleteState.failure.message}</p>
                {state.deleteState.requiresRefresh ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={callbacks.onRefresh}
                    disabled={state.isRefreshing || !capabilities.canRefresh}
                  >
                    {labels.deleteRefreshAction}
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          {state.deleteState.results.length > 0 ? (
            <section
              role="status"
              aria-label={labels.deleteResultsTitle}
              className="space-y-3 rounded-md border p-4"
            >
              <div>
                <h3 className="font-medium">{labels.deleteResultsTitle}</h3>
                {state.deleteState.requiresRefresh ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {labels.deleteRefreshRequired}
                  </p>
                ) : null}
              </div>
              <ol className="space-y-2">
                {state.deleteState.results.map((result) => (
                  <li
                    key={result.rowKey}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {result.displayLabel}
                    </span>
                    <Badge
                      variant={
                        result.status === "success"
                          ? "success"
                          : result.status === "failed"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {labels.deleteResultStatusLabels[result.status]}
                    </Badge>
                  </li>
                ))}
              </ol>
              {state.deleteState.requiresRefresh ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={callbacks.onRefresh}
                  disabled={state.isRefreshing || !capabilities.canRefresh}
                >
                  {labels.deleteRefreshAction}
                </Button>
              ) : null}
            </section>
          ) : null}

          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <div className="relative w-full md:max-w-sm">
              <Input
                ref={searchInputRef}
                value={state.searchValue}
                onChange={(event) => {
                  const value = event.target.value
                  callbacks.onSearchChange(value)
                  callbacks.onReplaceRouteQuery({
                    ...state.routeQuery,
                    channelId: undefined,
                    search: value || undefined,
                  })
                }}
                placeholder={labels.searchPlaceholder}
                className="ps-9"
                data-testid={MANAGED_SITE_CHANNELS_TEST_IDS.searchInput}
              />
              <ListFilter className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              {state.searchValue ? (
                <button
                  type="button"
                  aria-label={labels.clearSearch}
                  className="text-muted-foreground/80 absolute top-1/2 right-2 -translate-y-1/2"
                  onClick={() => {
                    callbacks.onSearchChange("")
                    callbacks.onReplaceRouteQuery({
                      ...state.routeQuery,
                      channelId: undefined,
                      search: undefined,
                    })
                    searchInputRef.current?.focus()
                  }}
                >
                  <CircleX className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 md:flex md:flex-1 md:items-center md:gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    leftIcon={<Filter className="h-4 w-4" />}
                  >
                    {labels.status}
                    {state.statusFilterValues.length > 0 ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({state.statusFilterValues.length})
                      </span>
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="start">
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium">
                      {labels.statusLabel}
                    </p>
                    <div className="space-y-2">
                      {uniqueStatusValues.map((value) => (
                        <div
                          key={value}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`status-${value}`}
                              checked={state.statusFilterValues.includes(value)}
                              onCheckedChange={(checked) =>
                                handleStatusChange(checked, value)
                              }
                            />
                            <Label
                              htmlFor={`status-${value}`}
                              className="text-sm font-normal"
                            >
                              {labels.statusLabels[value] ?? value}
                            </Label>
                          </div>
                          <span className="text-muted-foreground text-xs">
                            {statusCounts?.get(value) ?? 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    leftIcon={<Columns3 className="h-4 w-4" />}
                  >
                    {labels.columns}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>{labels.toggleColumns}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {table
                    .getAllLeafColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                        onSelect={(event) => event.preventDefault()}
                      >
                        {state.columns.find(
                          (registryColumn) => registryColumn.id === column.id,
                        )?.label ?? column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="col-span-2 grid grid-cols-2 gap-2 md:ml-auto md:flex md:items-center md:justify-end md:gap-2">
                {state.migrationMode && capabilities.canMigrateSelected ? (
                  <Button
                    variant="outline"
                    disabled={!selectedCount}
                    onClick={() =>
                      callbacks.onMigrateSelected(
                        selectedRows.map((row) => row.original.rowKey),
                      )
                    }
                    leftIcon={<ArrowRightLeft className="h-4 w-4" />}
                  >
                    {labels.migrateSelected}
                  </Button>
                ) : null}
                {state.migrationMode && capabilities.canMigrateFiltered ? (
                  <Button
                    variant="outline"
                    disabled={!filteredCount}
                    onClick={() =>
                      callbacks.onMigrateFiltered(
                        filteredRows.map((row) => row.original.rowKey),
                      )
                    }
                    leftIcon={<ArrowRightLeft className="h-4 w-4" />}
                  >
                    {labels.migrateFiltered}
                  </Button>
                ) : null}
                {!state.migrationMode && capabilities.canDeleteSelected ? (
                  <Button
                    variant="outline"
                    disabled={!selectedCount || isDeleteReplayBlocked}
                    data-testid={
                      MANAGED_SITE_CHANNELS_TEST_IDS.deleteSelectedButton
                    }
                    onClick={callbacks.onDeleteSelected}
                    leftIcon={<Trash2 className="h-4 w-4" />}
                  >
                    {labels.deleteSelected}
                  </Button>
                ) : null}
                {!state.migrationMode && capabilities.canSyncSelected ? (
                  <Button
                    variant="outline"
                    disabled={!selectedCount}
                    onClick={() =>
                      void callbacks.onSyncSelected(
                        selectedRows.map((row) => row.original.rowKey),
                      )
                    }
                    leftIcon={<RefreshCcw className="h-4 w-4" />}
                  >
                    {labels.syncSelected}
                  </Button>
                ) : null}
                {!state.migrationMode && capabilities.canCreate ? (
                  <Button
                    onClick={callbacks.onCreate}
                    disabled={isResourceInteractionBlocked}
                    leftIcon={<Plus className="h-4 w-4" />}
                    data-testid={
                      MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton
                    }
                  >
                    {labels.addChannel}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <ManagedSiteChannelsTable
            table={table}
            columnCount={columns.length}
            isInitialLoading={isInitialLoading}
            loadingLabel={labels.loading}
            emptyMessage={emptyTableMessage}
          />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Label htmlFor="rows-per-page" className="text-xs font-medium">
                {labels.rowsPerPage}
              </Label>
              <Select
                value={String(state.pagination.pageSize)}
                onValueChange={(value) =>
                  callbacks.onPaginationChange({
                    ...state.pagination,
                    pageSize: Number(value),
                  })
                }
              >
                <SelectTrigger
                  id="rows-per-page"
                  size="sm"
                  aria-label={labels.rowsPerPage}
                  className="w-[110px]"
                >
                  <SelectValue placeholder={labels.rowsPerPage} />
                </SelectTrigger>
                <SelectContent>
                  {rowsPerPageOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-muted-foreground ml-auto">
              {state.total ? (
                <span
                  data-testid={MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary}
                  data-start={
                    state.pagination.pageIndex * state.pagination.pageSize + 1
                  }
                  data-end={Math.min(
                    (state.pagination.pageIndex + 1) *
                      state.pagination.pageSize,
                    state.total,
                  )}
                  data-total={state.total}
                >
                  {labels.paginationSummary}
                </span>
              ) : (
                <span>{labels.noEntries}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label={labels.paginationPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label={labels.paginationNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <DestructiveConfirmDialog
        isOpen={state.deleteState.isOpen && !isDeleteReplayBlocked}
        onClose={callbacks.onDeleteCancel}
        title={
          state.deleteState.rowKeys.length > 1
            ? labels.deleteTitlePlural
            : labels.deleteTitle
        }
        description={labels.deleteDescription}
        cancelLabel={labels.deleteCancel}
        confirmLabel={labels.deleteConfirm}
        workingLabel={labels.deleting}
        confirmButtonTestId={
          MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton
        }
        cancelButtonTestId={
          MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelCancelButton
        }
        onConfirm={callbacks.onDeleteConfirm}
        isWorking={state.deleteState.isWorking}
      />

      {filterDialog}
    </div>
  )
}
