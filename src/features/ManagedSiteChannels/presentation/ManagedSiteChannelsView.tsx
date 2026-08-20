import {
  ArrowRightLeft,
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
import { useRef, type ReactNode } from "react"

import ManagedSiteConfigRequiredState from "~/components/ManagedSiteConfigRequiredState"
import { PageHeader } from "~/components/PageHeader"
import Tooltip from "~/components/Tooltip"
import {
  Badge,
  DestructiveConfirmDialog,
  IconButton,
  Input,
} from "~/components/ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/Alert"
import { Button, BUTTON_LOADING_BEHAVIORS } from "~/components/ui/button"
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
  MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
  MANAGED_SITE_CHANNELS_REFRESH_STATES,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "../testIds"
import type {
  ManagedChannelsCallbacks,
  ManagedChannelsCapabilities,
  ManagedChannelsLabels,
  ManagedChannelsPresentationState,
} from "./contracts"
import { ManagedSiteChannelsDeleteFeedback } from "./ManagedSiteChannelsDeleteFeedback"
import { ManagedSiteChannelsPagination } from "./ManagedSiteChannelsPagination"
import { ManagedSiteChannelsTable } from "./ManagedSiteChannelsTable"
import { useManagedSiteChannelsTable } from "./useManagedSiteChannelsTable"

type ManagedSiteChannelsViewProps = {
  state: ManagedChannelsPresentationState
  capabilities: ManagedChannelsCapabilities
  callbacks: ManagedChannelsCallbacks
  labels: ManagedChannelsLabels
  title: string
  titleActions?: ReactNode
  description: ReactNode
  configurationMissingDescription: string
  configurationMissingNotice?: ReactNode
  emptyContent?: ReactNode
  configurationSettingsTarget?: {
    tabId: "managedSite"
    anchor?: string
  }
  siteTypeLabel: string
  filterDialog?: ReactNode
}

/** Renders the shared managed-channel page for legacy and native controllers. */
export function ManagedSiteChannelsView({
  state,
  capabilities,
  callbacks,
  labels,
  title,
  titleActions,
  description,
  configurationMissingDescription,
  configurationMissingNotice,
  emptyContent,
  configurationSettingsTarget,
  siteTypeLabel,
  filterDialog,
}: ManagedSiteChannelsViewProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const isDeleteReplayBlocked = state.deleteState.requiresRefresh
  const isResourceInteractionBlocked =
    state.isResourceInteractionBlocked ?? false
  const {
    table,
    columnCount,
    statusCounts,
    uniqueStatusValues,
    selectedRows,
    filteredRows,
    selectedCount,
    filteredCount,
  } = useManagedSiteChannelsTable({
    state,
    callbacks,
    labels,
    isDeleteReplayBlocked,
    isResourceInteractionBlocked,
  })
  const emptyTableMessage =
    state.searchValue.trim() ||
    state.channelIdFilterValue.trim() ||
    state.statusFilterValues.length
      ? labels.emptyFiltered
      : labels.emptyNoChannels
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
          <>
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
            {titleActions}
          </>
        }
        description={description}
        actions={
          <>
            {!state.isConfigurationMissing && capabilities.canRefresh ? (
              <Button
                variant="outline"
                loading={state.isRefreshing}
                loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
                data-testid={MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton}
                {...{
                  [MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE]:
                    state.isRefreshing
                      ? MANAGED_SITE_CHANNELS_REFRESH_STATES.Loading
                      : MANAGED_SITE_CHANNELS_REFRESH_STATES.Idle,
                }}
                onClick={callbacks.onRefresh}
                leftIcon={<RefreshCcw className="h-4 w-4" />}
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
        <div className="space-y-4">
          <ManagedSiteConfigRequiredState
            description={configurationMissingDescription}
            settingsTarget={configurationSettingsTarget}
            onRetry={callbacks.onRefresh}
            isRetrying={state.isRefreshing}
          />
          {configurationMissingNotice}
        </div>
      ) : (
        <>
          {state.failure ? (
            <Alert variant={state.failure.variant ?? "destructive"}>
              <AlertTitle>{state.failure.category}</AlertTitle>
              <AlertDescription className="whitespace-pre-line">
                {state.failure.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <ManagedSiteChannelsDeleteFeedback
            deleteState={state.deleteState}
            labels={labels}
            canRefresh={capabilities.canRefresh}
            isRefreshing={state.isRefreshing}
            onRefresh={callbacks.onRefresh}
          />

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
            columnCount={columnCount}
            isInitialLoading={isInitialLoading}
            loadingLabel={labels.loading}
            emptyMessage={emptyTableMessage}
            emptyContent={emptyContent}
          />

          <ManagedSiteChannelsPagination
            table={table}
            pagination={state.pagination}
            total={state.total}
            labels={labels}
            onPaginationChange={callbacks.onPaginationChange}
          />
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
