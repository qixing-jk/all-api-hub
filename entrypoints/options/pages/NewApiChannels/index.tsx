import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
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
  Ellipsis,
  Filter,
  Layers,
  ListFilter,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react"
import { nanoid } from "nanoid"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/ChannelDialog"
import ChannelFiltersEditor from "~/components/ChannelFiltersEditor"
import { Input, Modal } from "~/components/ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/Alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { ChannelTypeNames } from "~/constants/newApi"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { cn } from "~/lib/utils"
import { channelConfigStorage } from "~/services/channelConfigStorage"
import {
  deleteChannel,
  getNewApiConfig,
} from "~/services/newApiService/newApiService"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { NewApiChannel } from "~/types/newapi"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

type ChannelRow = NewApiChannel
type CheckboxState = boolean | "indeterminate"
type RowActionsLabels = {
  edit: string
  sync: string
  syncing: string
  filters: string
  delete: string
}

/**
 * Load channel filter rules for the given channel.
 *
 * 1. Prefer the background runtime handler (`channelConfig:get`) so the
 *    authoritative storage inside the extension context is used.
 * 2. When the options page is running outside the extension (e.g. dev server)
 *    the runtime call fails—fall back to reading `channelConfigStorage`
 *    locally so editing is still possible.
 */
async function fetchChannelFilters(
  channelId: number,
): Promise<ChannelModelFilterRule[]> {
  try {
    const response = await sendRuntimeMessage({
      action: "channelConfig:get",
      channelId,
    })
    if (response?.success) {
      return response.data?.modelFilterSettings?.rules ?? []
    }
    throw new Error(response?.error || "Failed to load channel filters")
  } catch (runtimeError) {
    console.warn(
      `[ChannelFilters] Runtime fetch failed for channel ${channelId}, using fallback storage`,
      runtimeError,
    )
    try {
      const config = await channelConfigStorage.getConfig(channelId)
      return config.modelFilterSettings?.rules ?? []
    } catch (storageError) {
      console.error(
        `[ChannelFilters] Storage fallback failed for channel ${channelId}`,
        storageError,
      )
      throw storageError instanceof Error ? storageError : runtimeError
    }
  }
}

/**
 * Persist channel filter rules for the given channel.
 *
 * Tries to update via runtime messaging first so the background copy stays in
 * sync. If messaging is unavailable, we optimistically persist through the
 * local `channelConfigStorage` as a best-effort fallback.
 */
async function saveChannelFilters(
  channelId: number,
  filters: ChannelModelFilterRule[],
): Promise<void> {
  try {
    const response = await sendRuntimeMessage({
      action: "channelConfig:upsertFilters",
      channelId,
      filters,
    })
    if (!response?.success) {
      throw new Error(response?.error || "Failed to save channel filters")
    }
  } catch (runtimeError) {
    console.warn(
      `[ChannelFilters] Runtime save failed for channel ${channelId}, persisting locally`,
      runtimeError,
    )
    try {
      const success = await channelConfigStorage.upsertFilters(
        channelId,
        filters,
      )
      if (!success) {
        throw new Error("Failed to persist filters locally")
      }
    } catch (storageError) {
      console.error(
        `[ChannelFilters] Storage save failed for channel ${channelId}`,
        storageError,
      )
      throw storageError instanceof Error ? storageError : runtimeError
    }
  }
}

const STATUS_VARIANTS: Record<
  number,
  {
    labelKey: string
    className: string
    variant?: "secondary" | "destructive" | "outline"
  }
> = {
  0: { labelKey: "statusLabels.unknown", className: "", variant: "secondary" },
  1: {
    labelKey: "statusLabels.enabled",
    className: "border-emerald-200 text-emerald-700",
    variant: "secondary",
  },
  2: {
    labelKey: "statusLabels.manualPause",
    className: "border-amber-200 text-amber-800",
    variant: "outline",
  },
  3: {
    labelKey: "statusLabels.autoDisabled",
    className: "",
    variant: "destructive",
  },
}

const multiColumnFilterFn: FilterFn<ChannelRow> = (
  row,
  _columnId,
  filterValue,
) => {
  const content =
    `${row.original.name} ${row.original.base_url} ${row.original.group}`
      .toLowerCase()
      .trim()
  const searchTerm = (filterValue ?? "").toLowerCase().trim()
  if (!searchTerm) return true
  return content.includes(searchTerm)
}

const statusFilterFn: FilterFn<ChannelRow> = (
  row,
  columnId,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true
  return filterValue.includes(String(row.getValue(columnId)))
}

export default function NewApiChannelsPage() {
  const { t } = useTranslation("newApiChannels")
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configMissing, setConfigMissing] = useState(false)
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
      const config = await getNewApiConfig()
      if (!config) {
        setConfigMissing(true)
        setChannels([])
        return
      }
      setConfigMissing(false)
      const response = await sendRuntimeMessage({
        action: "newApiModelSync:listChannels",
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
      const config = await getNewApiConfig()
      if (!config) {
        throw new Error(t("toasts.configMissing"))
      }

      const results = await Promise.allSettled(
        pendingDeleteIds.map((id) =>
          deleteChannel(config.baseUrl, config.token, config.userId, id),
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
          action: "newApiModelSync:triggerSelected",
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
            onEdit={() => handleOpenEditDialog(row.original)}
            onDelete={() => scheduleDelete([row.original.id])}
            onSync={() => handleSyncChannels([row.original.id])}
            onFilters={() => handleOpenFilterDialog(row.original)}
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
            {t("alerts.configMissing.description")}
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
                  className="align-middle"
                >
                  {row
                    .getVisibleCells()
                    .map((cell: Cell<ChannelRow, unknown>) => (
                      <TableCell key={cell.id} className="py-3">
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
            aria-label={t("table.paginationPrev", "Previous page")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t("table.paginationNext", "Next page")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDeleteIds.length > 1
                ? t("dialog.deleteTitlePlural")
                : t("dialog.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialog.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("dialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChannelFilterDialog
        channel={filterDialogChannel}
        open={isFilterDialogOpen}
        onClose={handleCloseFilterDialog}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: number }) {
  const { t } = useTranslation("newApiChannels")
  const config = STATUS_VARIANTS[status] ?? STATUS_VARIANTS[0]
  return (
    <Badge
      variant={config.variant ?? "secondary"}
      className={cn("text-xs", config.className)}
    >
      {t(config.labelKey)}
    </Badge>
  )
}

function RowActions({
  onEdit,
  onDelete,
  onSync,
  onFilters,
  isSyncing,
  labels,
}: {
  onEdit: () => void
  onDelete: () => void
  onSync: () => void
  onFilters: () => void
  isSyncing: boolean
  labels: RowActionsLabels
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onEdit}>{labels.edit}</DropdownMenuItem>
        <DropdownMenuItem onClick={onSync} disabled={isSyncing}>
          {isSyncing ? labels.syncing : labels.sync}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onFilters}>
          {labels.filters}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          {labels.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ChannelFilterDialogProps {
  channel: ChannelRow | null
  open: boolean
  onClose: () => void
}

type EditableFilter = ChannelModelFilterRule

function ChannelFilterDialog({
  channel,
  open,
  onClose,
}: ChannelFilterDialogProps) {
  const { t } = useTranslation("newApiChannels")
  const [filters, setFilters] = useState<EditableFilter[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual")

  const resetState = useCallback(() => {
    setFilters([])
    setIsLoading(false)
    setIsSaving(false)
    setJsonText("")
    setViewMode("visual")
  }, [])

  const loadFilters = useCallback(async () => {
    if (!channel) return
    setIsLoading(true)
    try {
      const loadedFilters = await fetchChannelFilters(channel.id)
      setFilters(loadedFilters)
      try {
        setJsonText(JSON.stringify(loadedFilters, null, 2))
      } catch {
        setJsonText("")
      }
    } catch (error) {
      toast.error(
        t("filters.messages.loadFailed", { error: getErrorMessage(error) }),
      )
      onClose()
    } finally {
      setIsLoading(false)
    }
  }, [channel, onClose, t])

  useEffect(() => {
    if (open && channel) {
      void loadFilters()
    } else {
      resetState()
    }
  }, [channel, loadFilters, open, resetState])

  if (!channel) {
    return null
  }

  const handleFieldChange = (
    filterId: string,
    field: keyof EditableFilter,
    value: EditableFilter[typeof field],
  ) => {
    setFilters((prev) =>
      prev.map((filter) =>
        filter.id === filterId
          ? {
              ...filter,
              [field]: value,
              updatedAt: Date.now(),
            }
          : filter,
      ),
    )
  }

  const handleAddFilter = () => {
    const timestamp = Date.now()
    setFilters((prev) => [
      ...prev,
      {
        id: nanoid(),
        name: "",
        description: "",
        pattern: "",
        isRegex: false,
        action: "include",
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ])
  }

  const handleRemoveFilter = (filterId: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== filterId))
  }

  const validateFilters = (rules: EditableFilter[]) => {
    for (const filter of rules) {
      if (!filter.name.trim()) {
        return t("filters.messages.validationName")
      }
      if (!filter.pattern.trim()) {
        return t("filters.messages.validationPattern")
      }
      if (filter.isRegex) {
        try {
          new RegExp(filter.pattern.trim())
        } catch (error) {
          return t("filters.messages.validationRegex", {
            error: (error as Error).message,
          })
        }
      }
    }
    return null
  }

  const parseJsonFilters = (rawJson: string): EditableFilter[] => {
    const trimmed = rawJson.trim()
    if (!trimmed) {
      return []
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (error) {
      throw new Error(getErrorMessage(error))
    }

    if (!Array.isArray(parsed)) {
      throw new Error("JSON must be an array of filter rules")
    }

    const now = Date.now()

    return parsed.map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(`Filter at index ${index} is not an object`)
      }

      const anyItem = item as any
      const name = typeof anyItem.name === "string" ? anyItem.name.trim() : ""
      const pattern =
        typeof anyItem.pattern === "string" ? anyItem.pattern.trim() : ""

      if (!name) {
        throw new Error(`Filter at index ${index} is missing a name`)
      }

      if (!pattern) {
        throw new Error(`Filter at index ${index} is missing a pattern`)
      }

      return {
        id:
          typeof anyItem.id === "string" && anyItem.id.trim()
            ? anyItem.id.trim()
            : nanoid(),
        name,
        description:
          typeof anyItem.description === "string"
            ? anyItem.description
            : anyItem.description ?? "",
        pattern,
        isRegex: Boolean(anyItem.isRegex),
        action: anyItem.action === "exclude" ? "exclude" : "include",
        enabled: anyItem.enabled !== false,
        createdAt:
          typeof anyItem.createdAt === "number" && anyItem.createdAt > 0
            ? anyItem.createdAt
            : now,
        updatedAt:
          typeof anyItem.updatedAt === "number" && anyItem.updatedAt > 0
            ? anyItem.updatedAt
            : now,
      }
    })
  }

  const handleSave = async () => {
    let rulesToSave: EditableFilter[]

    if (viewMode === "json") {
      try {
        rulesToSave = parseJsonFilters(jsonText)
      } catch (error) {
        toast.error(
          t("filters.messages.jsonInvalid", { error: getErrorMessage(error) }),
        )
        return
      }
    } else {
      rulesToSave = filters
    }

    const validationError = validateFilters(rulesToSave)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setIsSaving(true)
    try {
      const payload = rulesToSave.map((filter) => ({
        ...filter,
        name: filter.name.trim(),
        description: filter.description?.trim() || undefined,
        pattern: filter.pattern.trim(),
      }))
      await saveChannelFilters(channel.id, payload)
      setFilters(rulesToSave)
      try {
        setJsonText(JSON.stringify(rulesToSave, null, 2))
      } catch {
        // ignore serialization errors
      }
      toast.success(t("filters.messages.saved"))
      onClose()
    } catch (error) {
      toast.error(
        t("filters.messages.saveFailed", { error: getErrorMessage(error) }),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="lg"
      panelClassName="max-h-[85vh]"
      header={
        <div>
          <p className="text-base font-semibold">{t("filters.title")}</p>
          <p className="text-muted-foreground text-sm">
            {t("filters.subtitle", { channel: channel.name })}
          </p>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("filters.actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} loading={isSaving}>
            {t("filters.actions.save")}
          </Button>
        </div>
      }
    >
      <ChannelFiltersEditor
        filters={filters}
        viewMode={viewMode}
        jsonText={jsonText}
        isLoading={isLoading}
        onAddFilter={handleAddFilter}
        onRemoveFilter={handleRemoveFilter}
        onFieldChange={handleFieldChange}
        onClickViewVisual={() => {
          if (viewMode === "visual") return
          try {
            const parsed = jsonText.trim() ? parseJsonFilters(jsonText) : []
            setFilters(parsed)
            setViewMode("visual")
          } catch (error) {
            toast.error(
              t("filters.messages.jsonInvalid", {
                error: getErrorMessage(error),
              }),
            )
          }
        }}
        onClickViewJson={() => {
          if (viewMode === "json") return
          try {
            setJsonText(JSON.stringify(filters, null, 2))
          } catch {
            setJsonText("")
          }
          setViewMode("json")
        }}
        onChangeJsonText={setJsonText}
      />
    </Modal>
  )
}

export { NewApiChannelsPage as Component }
