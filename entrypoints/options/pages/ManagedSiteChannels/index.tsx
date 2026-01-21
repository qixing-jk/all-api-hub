import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  Row,
  SortingState,
  useReactTable,
  VisibilityState,
  type Cell,
  type CellContext,
  type HeaderGroup,
} from "@tanstack/react-table"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleX,
  Columns3,
  Filter,
  Layers,
  ListFilter,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/ChannelDialog"
import { DestructiveConfirmDialog, Input } from "~/components/ui"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { ChannelTypeNames } from "~/constants/managedSite"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { cn } from "~/lib/utils"
import { getManagedSiteService } from "~/services/managedSiteService"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { openManagedSiteModelSyncForChannel } from "~/utils/navigation"

import ChannelFilterDialog from "./components/ChannelFilterDialog"
import RowActions from "./components/RowActions"
import StatusBadge, { STATUS_VARIANTS } from "./components/StatusBadge"
import type { ChannelRow, CheckboxState, RowActionsLabels } from "./types"
import {
  channelIdFilterFn,
  multiColumnFilterFn,
  statusFilterFn,
} from "./utils/filterFns"

/**
 * Main management page for New API channels including table, filters, and dialogs.
 * Fetches channel data, exposes filtering tools, and handles CRUD operations.
 */
interface ManagedSiteChannelsProps {
  refreshKey?: number
  routeParams?: Record<string, string>
}

/**
 * Render the managed site channels page with data loading, filtering, and actions.
 */
export default function ManagedSiteChannels({
  refreshKey,
  routeParams,
}: ManagedSiteChannelsProps) {
  const { t } = useTranslation(["managedSiteChannels", "messages"])
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configMissing, setConfigMissing] = useState(false)
  const [configMissingMessage, setConfigMissingMessage] = useState<
    string | null
  >(null)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    base_url: false,
    group: true,
  })
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ])
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([])
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [syncingIds, setSyncingIds] = useState<Set<number>>(new Set())
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)
  const [filterDialogChannel, setFilterDialogChannel] =
    useState<ChannelRow | null>(null)

  const { openWithCustom } = useChannelDialog()

  const refreshChannels = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const service = await getManagedSiteService()
      const config = await service.getConfig()
      if (!config) {
        setConfigMissing(true)
        setConfigMissingMessage(
          t(`messages:${service.messagesKey}.configMissing`),
        )
        setChannels([])
        return
      }
      setConfigMissing(false)
      setConfigMissingMessage(null)
      const response = await sendRuntimeMessage({
        action: "modelSync:listChannels",
      })
      if (!response?.success) {
        throw new Error(response?.error || "Failed to load channels")
      }
      setChannels(response.data?.items ?? [])
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      toast.error(t("alerts.loadError.description", { error: message }))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refreshChannels()
  }, [refreshChannels])

  useEffect(() => {
    if (refreshKey) {
      void refreshChannels()
    }
  }, [refreshChannels, refreshKey])

  const handleOpenCreateDialog = useCallback(() => {
    openWithCustom({
      mode: undefined,
      onSuccess: () => {
        toast.success(t("toasts.channelSaved"))
        void refreshChannels()
      },
    })
  }, [openWithCustom, refreshChannels, t])

  const handleOpenEditDialog = useCallback(
    (channel: ChannelRow) => {
      const groups =
        channel.group?.split(",").map((value) => value.trim()) ?? []
      const models =
        channel.models?.split(",").map((value) => value.trim()) ?? []
      openWithCustom({
        mode: "edit",
        channel,
        initialValues: {
          name: channel.name,
          type: channel.type,
          key: channel.key,
          base_url: channel.base_url,
          groups,
          models,
          priority: channel.priority,
          weight: channel.weight,
          status: channel.status,
        },
        initialGroups: groups,
        initialModels: models,
        onSuccess: () => {
          toast.success(t("toasts.channelUpdated"))
          void refreshChannels()
        },
      })
    },
    [openWithCustom, refreshChannels, t],
  )

  const scheduleDelete = useCallback((ids: number[]) => {
    if (!ids.length) return
    setPendingDeleteIds(ids)
    setIsDeleteDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteIds.length) return
    setIsDeleting(true)
    try {
      const service = await getManagedSiteService()
      const config = await service.getConfig()
      if (!config) {
        throw new Error(t(`messages:${service.messagesKey}.configMissing`))
      }

      const results = await Promise.allSettled(
        pendingDeleteIds.map((id) =>
          service.deleteChannel(
            config.baseUrl,
            config.token,
            config.userId,
            id,
          ),
        ),
      )

      const successIds: number[] = []
      const failedResults: PromiseRejectedResult[] = []

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successIds.push(pendingDeleteIds[index])
        } else {
          failedResults.push(result)
        }
      })

      if (successIds.length > 0) {
        setChannels((prev) =>
          prev.filter((channel) => !successIds.includes(channel.id)),
        )
        setRowSelection({})
        toast.success(
          successIds.length === 1
            ? t("toasts.channelDeleted")
            : t("toasts.channelsDeleted", { count: successIds.length }),
        )
      }

      if (failedResults.length > 0) {
        const firstError = failedResults[0].reason
        toast.error(
          failedResults.length === 1
            ? getErrorMessage(firstError)
            : t("toasts.someDeletesFailed", {
                count: failedResults.length,
                error: getErrorMessage(firstError),
              }),
        )
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
      setPendingDeleteIds([])
    }
  }, [pendingDeleteIds, t])

  const handleSyncChannels = useCallback(
    async (channelIds: number[]) => {
      if (!channelIds.length) return
      setSyncingIds((prev) => {
        const next = new Set(prev)
        channelIds.forEach((id) => next.add(id))
        return next
      })
      try {
        const response = await sendRuntimeMessage({
          action: "modelSync:triggerSelected",
          channelIds,
        })
        if (!response?.success) {
          throw new Error(response?.error || "Failed to sync channels")
        }
        const successCount =
          response.data?.statistics?.successCount ?? channelIds.length
        toast.success(
          t("toasts.syncCompleted", {
            success: successCount,
            total: channelIds.length,
          }),
        )
      } catch (err) {
        toast.error(t("toasts.syncFailed", { error: getErrorMessage(err) }))
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev)
          channelIds.forEach((id) => next.delete(id))
          return next
        })
      }
    },
    [t],
  )

  const rowActionLabels = useMemo<RowActionsLabels>(
    () => ({
      edit: t("table.rowActions.edit"),
      sync: t("table.rowActions.sync"),
      syncing: t("table.rowActions.syncing"),
      openSync: t("table.rowActions.openSync"),
      filters: t("table.rowActions.filters"),
      delete: t("table.rowActions.delete"),
    }),
    [t],
  )

  const handleOpenFilterDialog = useCallback((channel: ChannelRow) => {
    setFilterDialogChannel(channel)
    setIsFilterDialogOpen(true)
  }, [])

  const handleCloseFilterDialog = useCallback(() => {
    setIsFilterDialogOpen(false)
    setFilterDialogChannel(null)
  }, [])

  const columns = useMemo<ColumnDef<ChannelRow, unknown>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value: CheckboxState) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label={t("table.selectAll")}
          />
        ),
        cell: ({ row }: { row: Row<ChannelRow> }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: CheckboxState) =>
              row.toggleSelected(!!value)
            }
            aria-label={t("table.selectRow")}
          />
        ),
        size: 16,
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "id",
        header: t("table.columns.id"),
        cell: ({ row }: { row: Row<ChannelRow> }) => (
          <span className="font-mono text-sm">{row.original.id}</span>
        ),
        filterFn: channelIdFilterFn,
        size: 40,
      },
      {
        accessorKey: "name",
        header: t("table.columns.name"),
        cell: ({ row }: { row: Row<ChannelRow> }) => (
          <div>
            <div className="leading-tight font-medium">{row.original.name}</div>
            <div className="text-muted-foreground truncate text-xs">
              {row.original.base_url}
            </div>
          </div>
        ),
        filterFn: multiColumnFilterFn,
        enableHiding: false,
        size: 300,
      },
      {
        accessorKey: "type",
        header: t("table.columns.type"),
        cell: ({ row }: { row: Row<ChannelRow> }) =>
          ChannelTypeNames[row.original.type] ?? "Unknown",
        size: 90,
      },
      {
        accessorKey: "models",
        accessorFn: (row: ChannelRow) =>
          row.models?.split(",").filter(Boolean).length ?? 0,
        header: t("table.columns.models"),
        cell: ({ row, getValue }: CellContext<ChannelRow, unknown>) => {
          const modelCount = Number(getValue())
          return (
            <span className="text-sm font-medium">
              {modelCount ??
                row.original.models?.split(",").filter(Boolean).length ??
                0}
            </span>
          )
        },
        size: 90,
      },
      {
        accessorKey: "group",
        header: t("table.columns.group"),
        cell: ({ row }: { row: Row<ChannelRow> }) => {
          const groups = row.original.group?.split(",").filter(Boolean) ?? []
          if (!groups.length)
            return <span className="text-muted-foreground">—</span>
          return (
            <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
              {groups.slice(0, 3).map((group: string) => (
                <span key={group} className="rounded border px-1 py-0.5">
                  {group}
                </span>
              ))}
              {groups.length > 3 && <span>+{groups.length - 3}</span>}
            </div>
          )
        },
        size: 90,
      },
      {
        accessorKey: "status",
        header: t("table.columns.status"),
        filterFn: statusFilterFn,
        cell: ({ row }: { row: Row<ChannelRow> }) => (
          <StatusBadge status={row.original.status} />
        ),
        size: 90,
      },
      {
        accessorKey: "priority",
        header: t("table.columns.priority"),
        cell: ({ row }: { row: Row<ChannelRow> }) => row.original.priority,
        size: 60,
      },
      {
        accessorKey: "weight",
        header: t("table.columns.weight"),
        cell: ({ row }: { row: Row<ChannelRow> }) => row.original.weight,
        size: 60,
      },
      {
        id: "actions",
        header: () => (
          <span className="sr-only">{t("table.columns.actions")}</span>
        ),
        cell: ({ row }: { row: Row<ChannelRow> }) => (
          <RowActions
            channel={row.original}
            onEdit={handleOpenEditDialog}
            onDelete={scheduleDelete}
            onSync={handleSyncChannels}
            onOpenSync={openManagedSiteModelSyncForChannel}
            onFilters={handleOpenFilterDialog}
            isSyncing={syncingIds.has(row.original.id)}
            labels={rowActionLabels}
          />
        ),
        size: 60,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [
      handleOpenEditDialog,
      handleOpenFilterDialog,
      handleSyncChannels,
      rowActionLabels,
      scheduleDelete,
      syncingIds,
      t,
    ],
  )

  const table = useReactTable({
    data: channels,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableSortingRemoval: false,
  })

  useEffect(() => {
    const channelIdParam = routeParams?.channelId?.trim()
    const idColumn = table.getColumn("id")
    const nameColumn = table.getColumn("name")

    if (channelIdParam) {
      idColumn?.setFilterValue(channelIdParam)
      nameColumn?.setFilterValue(undefined)
      setPagination((prev) => ({ ...prev, pageIndex: 0 }))
      return
    }

    const searchParam = routeParams?.search?.trim()
    if (searchParam) {
      if (/^\d+$/.test(searchParam)) {
        idColumn?.setFilterValue(searchParam)
        nameColumn?.setFilterValue(undefined)
        setPagination((prev) => ({ ...prev, pageIndex: 0 }))
      }
      return
    }
  }, [routeParams?.channelId, routeParams?.search, table])

  const statusColumn = table.getColumn("status")
  const uniqueStatusValues = useMemo(() => {
    if (!statusColumn) return []
    const facetedValues = statusColumn.getFacetedUniqueValues()
    return Array.from(facetedValues.keys())
      .map((key) => String(key))
      .sort((a, b) => Number(a) - Number(b))
  }, [statusColumn])

  const statusCounts = useMemo(() => {
    if (!statusColumn) return new Map<string, number>()
    const facetedValues = statusColumn.getFacetedUniqueValues()
    const map = new Map<string, number>()
    facetedValues.forEach((count, key) => {
      map.set(String(key), count)
    })
    return map
  }, [statusColumn])

  const selectedStatuses = useMemo(() => {
    if (!statusColumn) return []
    return (statusColumn.getFilterValue() as string[]) ?? []
  }, [statusColumn])

  const selectedRows = table.getSelectedRowModel().rows
  const selectedCount = selectedRows.length
  const searchValue =
    (table.getColumn("name")?.getFilterValue() as string) ?? ""
  const rowsPerPageOptions = [10, 25, 50, 100]

  const handleStatusChange = (checked: CheckboxState, value: string) => {
    const filterValue = statusColumn?.getFilterValue() as string[]
    const next = filterValue ? [...filterValue] : []
    if (checked === true) {
      next.push(value)
    } else {
      const index = next.indexOf(value)
      if (index > -1) next.splice(index, 1)
    }
    statusColumn?.setFilterValue(next.length ? next : undefined)
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={Layers}
        title={t("title")}
        description={t("description")}
      />

      {configMissing && (
        <Alert variant="warning">
          <AlertTitle>{t("alerts.configMissing.title")}</AlertTitle>
          <AlertDescription>
            {configMissingMessage ?? t("alerts.configMissing.description")}
          </AlertDescription>
        </Alert>
      )}

      {error && !configMissing && (
        <Alert variant="destructive">
          <AlertTitle>{t("alerts.loadError.title")}</AlertTitle>
          <AlertDescription>
            {t("alerts.loadError.description", { error })}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Input
            value={searchValue}
            onChange={(event) =>
              table.getColumn("name")?.setFilterValue(event.target.value)
            }
            placeholder={t("toolbar.searchPlaceholder")}
            className="ps-9"
          />
          <ListFilter className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          {searchValue && (
            <button
              type="button"
              aria-label={t("toolbar.clearSearch")}
              className="text-muted-foreground/80 absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => table.getColumn("name")?.setFilterValue(undefined)}
            >
              <CircleX className="h-4 w-4" />
            </button>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" leftIcon={<Filter className="h-4 w-4" />}>
              {t("toolbar.status")}
              {selectedStatuses.length > 0 && (
                <span className="text-muted-foreground ml-2 text-xs">
                  ({selectedStatuses.length})
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">
                {t("filter.statusLabel")}
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
                        checked={selectedStatuses.includes(value)}
                        onCheckedChange={(checked: CheckboxState) =>
                          handleStatusChange(checked, value)
                        }
                      />
                      <Label
                        htmlFor={`status-${value}`}
                        className="text-sm font-normal"
                      >
                        {t(
                          STATUS_VARIANTS[Number(value)]?.labelKey ??
                            STATUS_VARIANTS[0].labelKey,
                        )}
                      </Label>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {statusCounts.get(value) ?? 0}
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
              {t("toolbar.columns")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t("toolbar.toggleColumns")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllLeafColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value: CheckboxState) =>
                    column.toggleVisibility(!!value)
                  }
                  onSelect={(event: Event) => event.preventDefault()}
                >
                  {t(`table.columns.${column.id}`, { defaultValue: column.id })}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-1 items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={!selectedCount}
            onClick={() =>
              scheduleDelete(selectedRows.map((row) => row.original.id))
            }
            leftIcon={<Trash2 className="h-4 w-4" />}
          >
            {t("toolbar.deleteSelected")}
          </Button>
          <Button
            variant="outline"
            disabled={!selectedCount}
            onClick={() =>
              handleSyncChannels(selectedRows.map((row) => row.original.id))
            }
            leftIcon={<RefreshCcw className="h-4 w-4" />}
          >
            {t("toolbar.syncSelected")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void refreshChannels()}
            leftIcon={<RefreshCcw className="h-4 w-4" />}
          >
            {t("toolbar.refresh")}
          </Button>
          <Button
            onClick={handleOpenCreateDialog}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t("toolbar.addChannel")}
          </Button>
        </div>
      </div>

      <div className="border-border bg-background overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table
              .getHeaderGroups()
              .map((headerGroup: HeaderGroup<ChannelRow>) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.id === "actions" &&
                          "bg-background sticky right-0 z-30 border-l",
                      )}
                      style={{ width: header.getSize() }}
                    >
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
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("table.loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row: Row<ChannelRow>) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="group align-middle"
                >
                  {row
                    .getVisibleCells()
                    .map((cell: Cell<ChannelRow, unknown>) => (
                      <TableCell
                        key={cell.id}
                        data-state={
                          cell.column.id === "actions" && row.getIsSelected()
                            ? "selected"
                            : undefined
                        }
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
                    {t("table.empty")}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Label htmlFor="rows-per-page" className="text-xs font-medium">
            {t("table.rowsPerPage")}
          </Label>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value: string) => table.setPageSize(Number(value))}
          >
            <SelectTrigger
              id="rows-per-page"
              size="sm"
              aria-label={t("table.rowsPerPage")}
              className="w-[110px]"
            >
              <SelectValue placeholder={t("table.rowsPerPage") ?? ""} />
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
          {table.getRowCount() ? (
            <span>
              {t("table.paginationSummary", {
                start:
                  table.getState().pagination.pageIndex *
                    table.getState().pagination.pageSize +
                  1,
                end: Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getRowCount(),
                ),
                total: table.getRowCount(),
              })}
            </span>
          ) : (
            <span>{t("table.noEntries")}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t("table.paginationPrev")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t("table.paginationNext")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DestructiveConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteDialogOpen(false)
            setPendingDeleteIds([])
          }
        }}
        title={
          pendingDeleteIds.length > 1
            ? t("dialog.deleteTitlePlural")
            : t("dialog.deleteTitle")
        }
        description={t("dialog.deleteDescription")}
        cancelLabel={t("dialog.cancel")}
        confirmLabel={t("dialog.confirm")}
        onConfirm={() => {
          void handleDelete()
        }}
        isWorking={isDeleting}
      />

      <ChannelFilterDialog
        channel={filterDialogChannel}
        open={isFilterDialogOpen}
        onClose={handleCloseFilterDialog}
      />
    </div>
  )
}
