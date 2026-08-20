import type { ManagedResourceChannelActionFacts } from "~/services/apiAdapters/contracts/managedResourceNative"

export const MANAGED_CHANNELS_CELL_TONES = {
  Default: "default",
  Success: "success",
  Warning: "warning",
  Danger: "danger",
} as const

export type ManagedChannelsCellTone =
  (typeof MANAGED_CHANNELS_CELL_TONES)[keyof typeof MANAGED_CHANNELS_CELL_TONES]

export const MANAGED_CHANNELS_CELL_KINDS = {
  Text: "text",
  Groups: "groups",
  Status: "status",
} as const

export const MANAGED_CHANNELS_COLUMN_RENDERERS = {
  Select: "select",
  Identifier: "identifier",
  Channel: "channel",
  Value: "value",
  Actions: "actions",
} as const

export type ManagedChannelsColumnRenderer =
  (typeof MANAGED_CHANNELS_COLUMN_RENDERERS)[keyof typeof MANAGED_CHANNELS_COLUMN_RENDERERS]

export const MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS = {
  DisplayIdentifier: "displayIdentifier",
  DisplayIdentifierSort: "displayIdentifierSort",
  Name: "name",
  Cell: "cell",
  CellSortValue: "cellSortValue",
} as const

export const MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS = {
  LegacyCommon: "legacy-common",
  Native: "native",
} as const

export const MANAGED_CHANNELS_SORT_DIRECTIONS = {
  Ascending: "asc",
  Descending: "desc",
} as const

export const MANAGED_CHANNELS_SORT_MISSING_PLACEMENTS = {
  First: "first",
  Last: "last",
} as const

export const MANAGED_CHANNELS_COLUMN_FACET_KINDS = {
  Status: "status",
} as const

export const MANAGED_CHANNELS_ROUTE_FILTER_KINDS = {
  Exact: "exact",
} as const

export const MANAGED_CHANNELS_ROUTE_QUERY_KEYS = {
  ChannelId: "channelId",
} as const

export const MANAGED_CHANNELS_COLUMN_IDS = {
  Select: "select",
  Identifier: "id",
  Name: "name",
  BaseUrl: "base_url",
  Type: "type",
  Models: "models",
  Group: "group",
  Status: "status",
  Priority: "priority",
  Weight: "weight",
  Actions: "actions",
} as const

export type ManagedChannelsCell =
  | {
      kind: typeof MANAGED_CHANNELS_CELL_KINDS.Text
      value: string
      sortValue: string | number
      missing?: boolean
    }
  | {
      kind: typeof MANAGED_CHANNELS_CELL_KINDS.Groups
      values: string[]
      sortValue: string
      missing?: boolean
    }
  | {
      kind: typeof MANAGED_CHANNELS_CELL_KINDS.Status
      value: string
      sortValue: string | number
      tone: ManagedChannelsCellTone
    }

export type ManagedChannelsRowViewModel = {
  /** Opaque controller key. It is never rendered or used as a DOM token. */
  rowKey: string
  /** Sanitized, non-sensitive token used only to build stable test ids. */
  testToken: string
  displayIdentifier: string
  displayIdentifierSort: string | number
  name: string
  baseURL: string
  /** Controller-supplied, display-safe text used by the generic search filter. */
  searchText: string
  cells: Record<string, ManagedChannelsCell>
  capabilities: {
    canEdit?: boolean
    canView?: boolean
    canDelete?: boolean
    canMigrate?: boolean
    canSync?: boolean
    canOpenSync?: boolean
    canFilter?: boolean
  }
  channelActions?: ManagedResourceChannelActionFacts
  isSyncing?: boolean
}

export type ManagedChannelsColumnId = string

export type ManagedChannelsColumnAccessor =
  | { kind: typeof MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.DisplayIdentifier }
  | {
      kind: typeof MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.DisplayIdentifierSort
    }
  | { kind: typeof MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.Name }
  | { kind: typeof MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.Cell; key: string }
  | {
      kind: typeof MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.CellSortValue
      key: string
    }

export type ManagedChannelsColumnExtension =
  | { kind: typeof MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.LegacyCommon }
  | {
      kind: typeof MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.Native
      namespace: string
    }

export type ManagedChannelsColumn = {
  id: ManagedChannelsColumnId
  label: string
  renderer: ManagedChannelsColumnRenderer
  accessor?: ManagedChannelsColumnAccessor
  canHide: boolean
  defaultVisible: boolean
  visible?: boolean
  sort?: {
    accessor: ManagedChannelsColumnAccessor
    defaultDirection: (typeof MANAGED_CHANNELS_SORT_DIRECTIONS)[keyof typeof MANAGED_CHANNELS_SORT_DIRECTIONS]
    missing: (typeof MANAGED_CHANNELS_SORT_MISSING_PLACEMENTS)[keyof typeof MANAGED_CHANNELS_SORT_MISSING_PLACEMENTS]
  }
  facet?: { kind: typeof MANAGED_CHANNELS_COLUMN_FACET_KINDS.Status }
  /** Declares route-owned filtering independently from how the value renders. */
  routeFilter?: {
    kind: typeof MANAGED_CHANNELS_ROUTE_FILTER_KINDS.Exact
    queryKey: typeof MANAGED_CHANNELS_ROUTE_QUERY_KEYS.ChannelId
  }
  size?: number
  cellClassName?: string
  extension: ManagedChannelsColumnExtension
}

export type ManagedChannelsSorting = { id: string; desc: boolean }[]
export type ManagedChannelsPagination = { pageIndex: number; pageSize: number }

export type ManagedChannelsFailureState = {
  message: string
  category?: string
  variant?: "destructive" | "warning"
}

export type ManagedChannelsDeleteState = {
  isOpen: boolean
  isWorking: boolean
  rowKeys: string[]
  results: Array<{
    rowKey: string
    displayLabel: string
    status: "success" | "failed" | "uncertain"
    resultKey: string
  }>
  requiresRefresh: boolean
  failure?: ManagedChannelsFailureState | null
}

export type ManagedChannelsPresentationState = {
  rows: ManagedChannelsRowViewModel[]
  routeQuery: Readonly<Record<string, string>>
  siteTypeValue: string
  siteTypeOptions: Array<{ value: string; label: string; disabled?: boolean }>
  selectedRowKeys: Record<string, boolean>
  sorting: ManagedChannelsSorting
  searchValue: string
  channelIdFilterValue: string
  statusFilterValues: string[]
  pagination: ManagedChannelsPagination
  total: number
  isLoading: boolean
  isRefreshing: boolean
  isResourceInteractionBlocked?: boolean
  failure?: ManagedChannelsFailureState | null
  isConfigurationMissing: boolean
  migrationMode: boolean
  columns: ManagedChannelsColumn[]
  deleteState: ManagedChannelsDeleteState
}

export type ManagedChannelsCapabilities = {
  canCreate: boolean
  canRefresh: boolean
  canDeleteSelected: boolean
  canSyncSelected: boolean
  canToggleMigration: boolean
  canMigrateSelected: boolean
  canMigrateFiltered: boolean
  hasMigrationTargets: boolean
}

export type ManagedChannelsLabels = {
  searchPlaceholder: string
  clearSearch: string
  refresh: string
  cancelRefresh: string
  status: string
  statusLabel: string
  columns: string
  toggleColumns: string
  migrateSelected: string
  migrateFiltered: string
  deleteSelected: string
  syncSelected: string
  addChannel: string
  loading: string
  emptyFiltered: string
  emptyNoChannels: string
  rowsPerPage: string
  paginationSummary: string
  noEntries: string
  paginationPrev: string
  paginationNext: string
  selectAll: string
  selectRow: string
  statusLabels: Record<string, string>
  settings: string
  configurationRequired: string
  goToSettings: string
  deleteTitle: string
  deleteTitlePlural: string
  deleteDescription: string
  deleteCancel: string
  deleteConfirm: string
  deleting: string
  deleteResultsTitle: string
  deleteRefreshRequired: string
  deleteRefreshAction: string
  deleteResultStatusLabels: Record<"success" | "failed" | "uncertain", string>
  migrationBeta: string
  enterMigrationMode: string
  exitMigrationMode: string
  rowActions: {
    trigger: string
    edit: string
    view: string
    migrate: string
    sync: string
    syncing: string
    openSync: string
    filters: string
    delete: string
  }
}

export type ManagedChannelsCallbacks = {
  onRefresh: () => void
  onSearchChange: (value: string) => void
  onReplaceRouteQuery: (query: Record<string, string | undefined>) => void
  onSettings: () => void
  onConfigurationRequired: () => void
  onSiteTypeChange: (value: string) => void | Promise<void>
  onChannelIdFilterChange: (value: string) => void
  onStatusFilterChange: (values: string[]) => void
  onSortingChange: (sorting: ManagedChannelsSorting) => void
  onColumnVisibilityChange: (
    visibility: Record<ManagedChannelsColumnId, boolean>,
  ) => void
  onPaginationChange: (pagination: ManagedChannelsPagination) => void
  onSelectedRowKeysChange: (keys: Record<string, boolean>) => void
  onCreate: () => void
  onToggleMigrationMode: () => void
  onMigrateSelected: (rowKeys: string[]) => void
  onMigrateFiltered: (rowKeys: string[]) => void
  onEdit: (rowKey: string) => void
  onView: (rowKey: string) => void
  onMigrate: (rowKey: string) => void
  onDelete: (rowKey: string) => void
  onSync: (rowKey: string) => Promise<void>
  onOpenSync: (rowKey: string) => Promise<void>
  onFilters: (rowKey: string) => void
  onDeleteSelected: () => void
  onSyncSelected: (rowKeys: string[]) => Promise<void>
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}

export type ManagedSiteMigrationComparison = {
  id:
    | "baseUrl"
    | "type"
    | "models"
    | "groups"
    | "priority"
    | "weight"
    | "status"
  label: string
  source: string
  target: string
  status: "same" | "changed" | "unsupported" | "unknown"
  tooltip?: string
}

export type ManagedSiteMigrationPreviewRow = {
  rowKey: string
  displayIdentifier: string
  name: string
  baseURL: string
  status: "ready" | "blocked"
  comparisons: [
    ManagedSiteMigrationComparison,
    ManagedSiteMigrationComparison,
    ManagedSiteMigrationComparison,
    ManagedSiteMigrationComparison,
    ManagedSiteMigrationComparison,
    ManagedSiteMigrationComparison,
    ManagedSiteMigrationComparison,
  ]
  warningText: string[]
  blockedReason?: string
  blockedMessage?: string
}

export type ManagedSiteMigrationPreviewState = {
  sourceLabel: string
  targetLabel?: string
  rows: ManagedSiteMigrationPreviewRow[]
  generalWarnings: string[]
  readyCount: number
  blockedCount: number
  totalCount: number
  isLoading: boolean
  isManualLoading: boolean
  error?: string | null
}

export type ManagedSiteMigrationResult = {
  summary: string
  /** Uncertain work requires a fresh target read before the dialog can close. */
  refreshRequired?: boolean
  /** Settled results never offer replay from the stale preview. */
  canReplay?: false
  items: Array<{
    rowKey: string
    displayIdentifier: string
    name: string
    status: "success" | "failed" | "skipped" | "uncertain"
    statusLabel: string
    message?: string
  }>
}

export type ManagedSiteMigrationLabels = {
  title: string
  beta: string
  description: string
  targetLabel: string
  targetPlaceholder: string
  sourceLabel: string
  destinationLabel: string
  unselectedTarget: string
  refreshPreview: string
  loadingPreview: string
  generalWarningsTitle: string
  generalWarningsSummary: string
  limitsLabel: string
  warningsLabel: string
  ready: string
  blocked: string
  fieldLabel: string
  resultsTitle: string
  close: string
  cancel: string
  start: string
  running: string
  footerSummary: string
  confirmationTitle: string
  confirmationDescription: string
  confirmationWarningTitle: string
  confirmationConfirm: string
  missingValue: string
  refreshRequired: string
  refreshRequiredAction?: string
}

export type ManagedSiteMigrationCallbacks = {
  onTargetChange: (target: string) => void
  onRefreshPreview: () => void
  onRecoverRefreshRequired: () => void | Promise<void>
  onConfirm: () => void | Promise<void>
  onClose: () => void
  onOpenConfirmation: () => void
  onCloseConfirmation: () => void
}
