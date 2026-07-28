import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { ChannelEditorShell } from "~/components/dialogs/ChannelDialog/components/ChannelEditorShell"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Modal,
} from "~/components/ui"
import type { ManagedSiteType } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  MANAGED_RESOURCE_MODES,
  MANAGED_RESOURCE_PRODUCT_ACTIONS,
  type ManagedResourceProductPolicy,
} from "~/services/accountSiteDefinitions/contracts"
import {
  getAccountSiteDefinition,
  getManagedSiteTypeValues,
} from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  type EditableResourceProjection,
  type ManagedResourceRegistration,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import {
  getManagedSiteAdminConfigForType,
  getManagedSiteConfigMissingMessage,
  getManagedSiteLabel,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteTargetOptions,
} from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { openSettingsTab } from "~/utils/navigation"

import { useManagedResourceListController } from "./controllers/useManagedResourceListController"
import { useManagedResourceMigrationController } from "./controllers/useManagedResourceMigrationController"
import { useManagedResourceMutationController } from "./controllers/useManagedResourceMutationController"
import ManagedSiteChannels from "./ManagedSiteChannels"
import type {
  ManagedChannelsCallbacks,
  ManagedChannelsCapabilities,
  ManagedChannelsColumn,
  ManagedChannelsLabels,
  ManagedChannelsPresentationState,
  ManagedSiteMigrationLabels,
} from "./presentation/contracts"
import { ManagedResourceEditorBody } from "./presentation/ManagedResourceEditorBody"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
} from "./presentation/managedResourceFieldPolicy"
import { ManagedSiteChannelDetailView } from "./presentation/ManagedSiteChannelDetailView"
import { ManagedSiteChannelsView } from "./presentation/ManagedSiteChannelsView"
import { ManagedSiteMigrationDialogView } from "./presentation/ManagedSiteMigrationDialogView"

type ManagedSiteChannelsRouteProps = {
  siteType: ManagedSiteType
  refreshKey?: number
  routeParams?: Record<string, string>
  onReplaceRouteQuery: (query: Record<string, string | undefined>) => void
}

const resolvePolicy = (
  siteType: ManagedSiteType,
): ManagedResourceProductPolicy | undefined =>
  getAccountSiteDefinition(siteType)?.managedResource

/** Renders a controlled failure when static native integration is incomplete. */
function ManagedSiteChannelsIntegrationFailure() {
  const { t } = useTranslation(["managedSiteChannels", "common"])

  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{t("managedSiteChannels:alerts.loadError.title")}</AlertTitle>
      <AlertDescription>
        {t("common:rootErrorBoundary.genericDescription")}
      </AlertDescription>
    </Alert>
  )
}

const getFailureMessage = (
  t: ReturnType<typeof useTranslation>["t"],
  failure: ResourceFailure | null,
) => {
  if (!failure) return null
  switch (failure.code) {
    case MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed:
      return {
        category: t("managedSiteChannels:alerts.authenticationFailed.title"),
        message: t(
          "managedSiteChannels:alerts.authenticationFailed.description",
        ),
      }
    case MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied:
      return {
        category: t("managedSiteChannels:alerts.permissionDenied.title"),
        message: t("managedSiteChannels:alerts.permissionDenied.description"),
      }
    case MANAGED_RESOURCE_FAILURE_CODES.Unavailable:
      return {
        category: t("managedSiteChannels:alerts.unavailable.title"),
        message: t("managedSiteChannels:alerts.unavailable.description"),
      }
  }
  return {
    category: t("managedSiteChannels:alerts.loadError.title"),
    message: t("common:rootErrorBoundary.genericDescription"),
  }
}

const createNativeColumns = (
  t: ReturnType<typeof useTranslation>["t"],
  policy: ManagedResourceProductPolicy,
  visibility: Readonly<Record<string, boolean>>,
): ManagedChannelsColumn[] => {
  const hasField = (fieldId: string) => policy.tableFieldIds.includes(fieldId)
  const valueColumn = (
    id: string,
    label: string,
    fieldId: string,
    options: Partial<ManagedChannelsColumn> = {},
  ): ManagedChannelsColumn => ({
    id,
    label,
    renderer: "value",
    accessor: { kind: "cell", key: fieldId },
    canHide: true,
    defaultVisible: true,
    visible: visibility[id] !== false,
    sort: {
      accessor: { kind: "cellSortValue", key: fieldId },
      defaultDirection: "asc",
      missing: "last",
    },
    extension: { kind: "legacy-common" },
    ...options,
  })

  return [
    {
      id: "select",
      label: "",
      renderer: "select",
      canHide: false,
      defaultVisible: true,
      visible: true,
      extension: { kind: "legacy-common" },
    },
    {
      id: "id",
      label: t("managedSiteChannels:table.columns.id"),
      renderer: "identifier",
      accessor: { kind: "displayIdentifier" },
      canHide: true,
      defaultVisible: true,
      visible: visibility.id !== false,
      sort: {
        accessor: { kind: "displayIdentifierSort" },
        defaultDirection: "desc",
        missing: "last",
      },
      size: 40,
      extension: { kind: "legacy-common" },
    },
    {
      id: "name",
      label: t("managedSiteChannels:table.columns.name"),
      renderer: "channel",
      accessor: { kind: "name" },
      canHide: false,
      defaultVisible: true,
      visible: true,
      sort: {
        accessor: { kind: "name" },
        defaultDirection: "asc",
        missing: "last",
      },
      size: 300,
      extension: { kind: "legacy-common" },
    },
    ...(hasField("type")
      ? [
          valueColumn(
            "type",
            t("managedSiteChannels:table.columns.type"),
            "type",
          ),
        ]
      : []),
    ...(hasField("supportedModels")
      ? [
          valueColumn(
            "models",
            t("managedSiteChannels:table.columns.models"),
            "supportedModels",
          ),
        ]
      : []),
    valueColumn(
      "status",
      t("managedSiteChannels:table.columns.status"),
      "status",
      { facet: { kind: "status" } },
    ),
    ...(hasField("tags")
      ? [
          valueColumn(
            "tags",
            t("managedSiteChannels:editor.fields.tags.label"),
            "tags",
            {
              extension: { kind: "native", namespace: policy.primaryKind },
            },
          ),
        ]
      : []),
    {
      id: "actions",
      label: t("managedSiteChannels:table.columns.actions"),
      renderer: "actions",
      canHide: false,
      defaultVisible: true,
      visible: true,
      size: 60,
      extension: { kind: "legacy-common" },
    },
  ]
}

const createNativeLabels = (
  t: ReturnType<typeof useTranslation>["t"],
  pagination: { pageIndex: number; pageSize: number },
  total: number,
): ManagedChannelsLabels => ({
  searchPlaceholder: t("managedSiteChannels:toolbar.searchPlaceholder"),
  clearSearch: t("managedSiteChannels:toolbar.clearSearch"),
  refresh: t("managedSiteChannels:toolbar.refresh"),
  cancelRefresh: t("managedSiteChannels:toolbar.cancelRefresh"),
  status: t("managedSiteChannels:toolbar.status"),
  statusLabel: t("managedSiteChannels:filter.statusLabel"),
  columns: t("managedSiteChannels:toolbar.columns"),
  toggleColumns: t("managedSiteChannels:toolbar.toggleColumns"),
  migrateSelected: t("managedSiteChannels:toolbar.migrateSelected"),
  migrateFiltered: t("managedSiteChannels:toolbar.migrateFiltered"),
  deleteSelected: t("managedSiteChannels:toolbar.deleteSelected"),
  syncSelected: t("managedSiteChannels:toolbar.syncSelected"),
  addChannel: t("managedSiteChannels:toolbar.addChannel"),
  loading: t("managedSiteChannels:table.loading"),
  emptyFiltered: t("managedSiteChannels:table.emptyFiltered"),
  emptyNoChannels: t("managedSiteChannels:table.emptyNoChannels"),
  rowsPerPage: t("managedSiteChannels:table.rowsPerPage"),
  paginationSummary: t("managedSiteChannels:table.paginationSummary", {
    start: total ? pagination.pageIndex * pagination.pageSize + 1 : 0,
    end: Math.min((pagination.pageIndex + 1) * pagination.pageSize, total),
    total,
  }),
  noEntries: t("managedSiteChannels:table.noEntries"),
  paginationPrev: t("managedSiteChannels:table.paginationPrev"),
  paginationNext: t("managedSiteChannels:table.paginationNext"),
  selectAll: t("managedSiteChannels:table.selectAll"),
  selectRow: t("managedSiteChannels:table.selectRow"),
  statusLabels: {
    enabled: t("managedSiteChannels:statusLabels.enabled"),
    disabled: t("managedSiteChannels:statusLabels.manualPause"),
    archived: t("managedSiteChannels:editor.options.status.archived"),
    "auto-disabled": t("managedSiteChannels:statusLabels.autoDisabled"),
    unknown: t("managedSiteChannels:statusLabels.unknown"),
  },
  settings: t("common:labels.settings"),
  configurationRequired: t("common:status.configurationRequired"),
  goToSettings: t("common:actions.goToSettings"),
  deleteTitle: t("managedSiteChannels:dialog.deleteTitle"),
  deleteTitlePlural: t("managedSiteChannels:dialog.deleteTitlePlural"),
  deleteDescription: t("managedSiteChannels:dialog.deleteDescription"),
  deleteCancel: t("managedSiteChannels:dialog.cancel"),
  deleteConfirm: t("managedSiteChannels:dialog.confirm"),
  deleting: t("common:status.deleting"),
  deleteResultsTitle: t("managedSiteChannels:dialog.deleteResultsTitle"),
  deleteRefreshRequired: t("managedSiteChannels:dialog.deleteRefreshRequired"),
  deleteRefreshAction: t("managedSiteChannels:dialog.deleteRefreshAction"),
  deleteResultStatusLabels: {
    success: t("managedSiteChannels:dialog.deleteResultStatus.success"),
    failed: t("managedSiteChannels:dialog.deleteResultStatus.failed"),
    uncertain: t("managedSiteChannels:dialog.deleteResultStatus.uncertain"),
  },
  migrationBeta: t("managedSiteChannels:migration.betaBadge"),
  enterMigrationMode: t("managedSiteChannels:toolbar.enterMigrationMode"),
  exitMigrationMode: t("managedSiteChannels:toolbar.exitMigrationMode"),
  rowActions: {
    trigger: t("managedSiteChannels:table.columns.actions"),
    edit: t("managedSiteChannels:table.rowActions.edit"),
    view: t("managedSiteChannels:table.rowActions.view"),
    migrate: t("managedSiteChannels:table.rowActions.migrate"),
    sync: t("managedSiteChannels:table.rowActions.sync"),
    syncing: t("managedSiteChannels:table.rowActions.syncing"),
    openSync: t("managedSiteChannels:table.rowActions.openSync"),
    filters: t("managedSiteChannels:table.rowActions.filters"),
    delete: t("managedSiteChannels:table.rowActions.delete"),
  },
})

const createMigrationLabels = (
  t: ReturnType<typeof useTranslation>["t"],
  selectedCount: number,
  preview: ReturnType<typeof useManagedResourceMigrationController>["preview"],
): ManagedSiteMigrationLabels => ({
  title: t("managedSiteChannels:migration.title"),
  beta: t("managedSiteChannels:migration.betaBadge"),
  description: t("managedSiteChannels:migration.description", {
    selectedCount,
  }),
  targetLabel: t("managedSiteChannels:migration.target.label"),
  targetPlaceholder: t("managedSiteChannels:migration.target.placeholder"),
  sourceLabel: t("managedSiteChannels:migration.target.sourceLabel"),
  destinationLabel: t("managedSiteChannels:migration.target.destinationLabel"),
  unselectedTarget: t("managedSiteChannels:migration.target.unselected"),
  refreshPreview: t("managedSiteChannels:migration.actions.refreshPreview"),
  loadingPreview: t("managedSiteChannels:migration.preview.loading"),
  generalWarningsTitle: t(
    "managedSiteChannels:migration.generalWarnings.title",
  ),
  generalWarningsSummary: t(
    "managedSiteChannels:migration.generalWarnings.compactSummary",
  ),
  limitsLabel: t("managedSiteChannels:migration.preview.badges.limitsLabel"),
  warningsLabel: t(
    "managedSiteChannels:migration.preview.badges.warningsLabel",
  ),
  ready: t("managedSiteChannels:migration.preview.status.ready"),
  blocked: t("managedSiteChannels:migration.preview.status.blocked"),
  fieldLabel: t("managedSiteChannels:migration.preview.compare.fieldLabel"),
  resultsTitle: t("managedSiteChannels:migration.results.title"),
  close: t("managedSiteChannels:migration.actions.close"),
  cancel: t("managedSiteChannels:migration.actions.cancel"),
  start: t("managedSiteChannels:migration.actions.start"),
  running: t("managedSiteChannels:migration.actions.running"),
  footerSummary: t("managedSiteChannels:migration.preview.summary", {
    ready: preview?.readyCount ?? 0,
    blocked: preview?.blockedCount ?? 0,
    total: preview?.totalCount ?? selectedCount,
  }),
  confirmationTitle: t("managedSiteChannels:migration.confirm.title"),
  confirmationDescription: t(
    "managedSiteChannels:migration.confirm.description",
    {
      ready: preview?.readyCount ?? 0,
      total: preview?.totalCount ?? selectedCount,
    },
  ),
  confirmationWarningTitle: t(
    "managedSiteChannels:migration.confirm.warningTitle",
  ),
  confirmationConfirm: t("managedSiteChannels:migration.confirm.confirm"),
  missingValue: t("common:labels.notAvailable"),
  refreshRequired: t("managedSiteChannels:migration.results.refreshRequired"),
  refreshRequiredAction: t(
    "managedSiteChannels:migration.actions.refreshChannels",
  ),
})

/** Composes native controllers with the shared channels presentation surfaces. */
function NativeManagedSiteChannels({
  siteType,
  refreshKey,
  routeParams = {},
  onReplaceRouteQuery,
  policy,
  registration,
}: ManagedSiteChannelsRouteProps & {
  policy: ManagedResourceProductPolicy
  registration: ManagedResourceRegistration
}) {
  const { t } = useTranslation([
    "managedSiteChannels",
    "channelDialog",
    "common",
    "messages",
    "settings",
  ])
  const { preferences, updateManagedSiteType } = useUserPreferencesContext()
  const config = getManagedSiteAdminConfigForType(preferences, siteType)
  const latestRouteParams = useRef(routeParams)
  const latestTranslate = useRef(t)
  latestRouteParams.current = routeParams
  latestTranslate.current = t
  const resolveLabel = useCallback(
    ((key: string) => latestTranslate.current(key)) as TFunction,
    [],
  )
  const onUnsupportedSearch = useCallback(() => {
    onReplaceRouteQuery({
      ...latestRouteParams.current,
      search: undefined,
    })
  }, [onReplaceRouteQuery])
  const onMutationSuccess = useCallback(
    (mode: "create" | "edit") =>
      toast.success(
        t(
          mode === "create"
            ? "managedSiteChannels:toasts.channelSaved"
            : "managedSiteChannels:toasts.channelUpdated",
        ),
      ),
    [t],
  )
  const [searchValue, setSearchValue] = useState(routeParams.search ?? "")
  const [sorting, setSorting] = useState([{ id: "id", desc: true }])
  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >({})
  const [pageSize, setPageSize] = useState(10)
  const [migrationMode, setMigrationMode] = useState(false)
  const [migrationRowKeys, setMigrationRowKeys] = useState<string[]>([])
  const [isMigrationOpen, setIsMigrationOpen] = useState(false)
  const [editorValues, setEditorValues] = useState<EditableResourceProjection>(
    {},
  )
  const analytics = useMemo(() => {
    const managedSiteType = resolveProductAnalyticsManagedSiteType(siteType)
    return managedSiteType
      ? { managedSiteType, startAction: startProductAnalyticsAction }
      : undefined
  }, [siteType])

  useEffect(
    () => setSearchValue(routeParams.search ?? ""),
    [routeParams.search],
  )
  const list = useManagedResourceListController({
    registration,
    scopeKey: config?.baseUrl ?? `${siteType}:configuration-missing`,
    search: searchValue,
    refreshKey,
    pageSize,
    onUnsupportedSearch,
    resolveLabel,
    analytics,
  })
  const mutation = useManagedResourceMutationController({
    workspace: list.workspace,
    refresh: list.refreshSilently,
    resolveRef: list.resolveRef,
    mapFacts: list.mapFacts,
    onMutationSuccess,
    analytics,
  })
  useEffect(() => {
    setEditorValues(mutation.editor?.initialValues ?? {})
  }, [mutation.editor])
  const targets = useMemo(
    () =>
      getManagedSiteTargetOptions(preferences, {
        excludeSiteTypes: [siteType],
      }).map((target) => ({
        value: target.siteType,
        label: getManagedSiteLabel(t, target.siteType),
      })),
    [preferences, siteType, t],
  )
  const migration = useManagedResourceMigrationController({
    isOpen: isMigrationOpen,
    sourceSiteType: siteType,
    scopeIdentity: config?.baseUrl ?? `${siteType}:configuration-missing`,
    selectedRowKeys: migrationRowKeys,
    targets,
    resolveRef: list.resolveRef,
    resolveDisplayName: (rowKey) =>
      list.allRows.find((row) => row.rowKey === rowKey)?.name,
    refresh: list.refreshSilently,
    onClose: () => setIsMigrationOpen(false),
    t,
    getSiteLabel: (targetSiteType) => getManagedSiteLabel(t, targetSiteType),
    analytics,
  })
  const editorPolicy =
    mutation.editor && mutation.editorMode
      ? getManagedResourceFieldPolicy(
          siteType,
          policy.primaryKind,
          mutation.editorMode,
        )
      : undefined
  const liveEditorValidation =
    mutation.editor &&
    mutation.editorFailure?.code ===
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed
      ? mutation.editor.validate(editorValues)
      : null
  const editorFieldIssues = liveEditorValidation
    ? liveEditorValidation.valid
      ? []
      : liveEditorValidation.issues
    : mutation.editorFailure?.fieldIssues
  const rowsByKey = useMemo(
    () => new Map(list.allRows.map((row) => [row.rowKey, row])),
    [list.allRows],
  )
  const columns = useMemo(
    () => createNativeColumns(t, policy, columnVisibility),
    [columnVisibility, policy, t],
  )
  const pagination = useMemo(
    () => ({ pageIndex: list.pageIndex, pageSize }),
    [list.pageIndex, pageSize],
  )
  const labels = useMemo(
    () => createNativeLabels(t, pagination, list.totalRows),
    [list.totalRows, pagination, t],
  )
  const canMigrate =
    policy.actions.includes(MANAGED_RESOURCE_PRODUCT_ACTIONS.Migrate) &&
    targets.length > 0
  const nativeRows = useMemo(
    () =>
      list.allRows.map((row) => ({
        ...row,
        capabilities: {
          ...row.capabilities,
          canMigrate: canMigrate && row.capabilities.canView,
        },
      })),
    [canMigrate, list.allRows],
  )
  const editorPageFailure = (() => {
    switch (mutation.editorFeedback?.kind) {
      case "open-failed":
        return {
          category: t("managedSiteChannels:alerts.editorLoadError.title"),
          message: t("managedSiteChannels:alerts.editorLoadError.description"),
        }
      case "save-failed":
        return mutation.editor === null
          ? {
              category: t("managedSiteChannels:alerts.editorSaveError.title"),
              message: t(
                "managedSiteChannels:alerts.editorSaveError.description",
              ),
            }
          : null
      case "save-uncertain":
        return {
          category: t("managedSiteChannels:alerts.partialMutation.title"),
          message: t("managedSiteChannels:alerts.partialMutation.description"),
        }
      case "saved-refresh-failed":
        return {
          category: t("managedSiteChannels:alerts.savedRefreshError.title"),
          message: t(
            "managedSiteChannels:alerts.savedRefreshError.description",
          ),
          variant: "warning" as const,
        }
      default:
        return null
    }
  })()
  const failure = editorPageFailure ?? getFailureMessage(t, list.failure)
  const isConfigurationMissing =
    config === null ||
    list.failure?.code ===
      MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired ||
    list.failure?.code === MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration
  const state: ManagedChannelsPresentationState = {
    rows: nativeRows,
    routeQuery: routeParams,
    siteTypeValue: siteType,
    siteTypeOptions: getManagedSiteTypeValues().map((value) => ({
      value,
      label: getManagedSiteLabel(t, value),
    })),
    selectedRowKeys: list.selectedRowKeys,
    sorting,
    searchValue,
    channelIdFilterValue: routeParams.channelId ?? "",
    statusFilterValues: [...list.statusFilter],
    pagination,
    total: list.totalRows,
    isLoading: list.isLoading,
    isRefreshing: list.isLoading,
    failure,
    isConfigurationMissing,
    migrationMode,
    columns,
    deleteState: {
      isOpen: mutation.deleteState.isOpen,
      isWorking: mutation.deleteState.isExecuting,
      rowKeys: mutation.deleteState.rowKeys,
      results: mutation.deleteState.results.map((result) => ({
        ...result,
        displayLabel: rowsByKey.get(result.rowKey)?.name ?? "",
      })),
      requiresRefresh: mutation.deleteState.requiresRefresh,
      failure: getFailureMessage(t, mutation.deleteState.failure),
    },
  }
  const capabilities: ManagedChannelsCapabilities = {
    canCreate:
      mutation.capabilities.canCreate &&
      policy.actions.includes(MANAGED_RESOURCE_PRODUCT_ACTIONS.Create),
    canRefresh: true,
    canDeleteSelected:
      mutation.capabilities.canDelete &&
      policy.actions.includes(MANAGED_RESOURCE_PRODUCT_ACTIONS.DeleteSelected),
    canSyncSelected: false,
    canToggleMigration: canMigrate || migrationMode,
    canMigrateSelected: canMigrate,
    canMigrateFiltered: canMigrate,
    showNewApiOnlyActions: false,
    hasMigrationTargets: targets.length > 0,
  }
  const callbacks: ManagedChannelsCallbacks = {
    onRefresh: () => {
      if (list.isLoading) list.cancelCollection()
      else if (mutation.deleteState.requiresFreshRead)
        void mutation.recoverFreshRead()
      else void list.refresh()
    },
    onSearchChange: setSearchValue,
    onReplaceRouteQuery,
    onSettings: () => {
      void openSettingsTab(policy.settingsTarget.tabId, {
        anchor: policy.settingsTarget.anchor,
        preserveHistory: true,
      })
    },
    onConfigurationRequired: () => {
      void openSettingsTab(policy.settingsTarget.tabId, {
        anchor: policy.settingsTarget.anchor,
        preserveHistory: true,
      })
    },
    onSiteTypeChange: async (value) => {
      if (value === siteType) return
      const result = await updateManagedSiteType(value as ManagedSiteType)
      showUpdateToast(result, t("settings:managedSite.siteTypeLabel"))
    },
    onChannelIdFilterChange: () => undefined,
    onStatusFilterChange: list.setStatusFilter,
    onSortingChange: setSorting,
    onColumnVisibilityChange: (next) =>
      setColumnVisibility((current) => ({ ...current, ...next })),
    onPaginationChange: (next) => {
      setPageSize(next.pageSize)
      list.setPageIndex(next.pageIndex)
    },
    onSelectedRowKeysChange: list.setSelectedRowKeys,
    onCreate: () => void mutation.openCreate(),
    onToggleMigrationMode: () => setMigrationMode((current) => !current),
    onMigrateSelected: (rowKeys) => {
      setMigrationRowKeys(rowKeys)
      setIsMigrationOpen(true)
    },
    onMigrateFiltered: (rowKeys) => {
      setMigrationRowKeys(rowKeys)
      setIsMigrationOpen(true)
    },
    onEdit: (rowKey) => void mutation.openEdit(rowKey),
    onView: (rowKey) => void mutation.openDetail(rowKey),
    onMigrate: (rowKey) => {
      setMigrationRowKeys([rowKey])
      setIsMigrationOpen(true)
    },
    onDelete: mutation.openDelete,
    onSync: async () => undefined,
    onOpenSync: async () => undefined,
    onFilters: () => undefined,
    onDeleteSelected: () => {
      void mutation.bulkDelete(
        Object.keys(list.selectedRowKeys).filter(
          (rowKey) => list.selectedRowKeys[rowKey],
        ),
      )
    },
    onSyncSelected: async () => undefined,
    onDeleteConfirm: () => void mutation.confirmDelete(),
    onDeleteCancel: mutation.cancelDelete,
  }

  const detailPolicy = getManagedResourceFieldPolicy(
    siteType,
    policy.primaryKind,
    MANAGED_RESOURCE_EDITOR_MODES.Edit,
  )
  const detailLabels = new Map(
    detailPolicy?.fields.map((field) => [field.fieldId, field.resolveLabel]),
  )
  const detailFields = mutation.detail
    ? policy.detailFieldIds.flatMap((fieldId) => {
        const value = mutation.detail?.cells[fieldId]
        const resolveLabel = detailLabels.get(fieldId)
        return value && resolveLabel ? [{ label: resolveLabel(t), value }] : []
      })
    : []

  return (
    <>
      <ManagedSiteChannelsView
        state={state}
        capabilities={capabilities}
        callbacks={callbacks}
        labels={labels}
        title={t(policy.titleKey)}
        description={t("managedSiteChannels:resourceDescription")}
        configurationMissingDescription={getManagedSiteConfigMissingMessage(
          t,
          getManagedSiteMessagesKeyFromSiteType(siteType),
        )}
        configurationSettingsTarget={policy.settingsTarget}
        siteTypeLabel={t("settings:managedSite.siteTypeLabel")}
      />

      {mutation.editor && mutation.editorMode && editorPolicy ? (
        <ChannelEditorShell
          isOpen
          title={t(
            mutation.editorMode === "create"
              ? "channelDialog:title.add"
              : "channelDialog:title.edit",
          )}
          description={t(
            mutation.editorMode === "create"
              ? "channelDialog:description.add"
              : "channelDialog:description.edit",
          )}
          onClose={mutation.closeEditor}
          onSubmit={(event) => {
            event.preventDefault()
            void mutation.submit(editorValues)
          }}
          submitLabel={t(
            mutation.editorMode === "create"
              ? "channelDialog:actions.create"
              : "channelDialog:actions.update",
          )}
          closeLabel={t("common:actions.cancel")}
          submitTestId={CHANNEL_DIALOG_TEST_IDS.submitButton}
          isSubmitting={mutation.isSaving}
          noValidate
        >
          {mutation.editorFeedback?.kind === "save-failed" &&
          mutation.editorFeedback.failure.code !==
            MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>
                {t("managedSiteChannels:alerts.editorSaveError.title")}
              </AlertTitle>
              <AlertDescription>
                {t("managedSiteChannels:alerts.editorSaveError.description")}
              </AlertDescription>
            </Alert>
          ) : null}
          <ManagedResourceEditorBody
            t={t}
            mode={mutation.editorMode}
            descriptors={mutation.editor.fields}
            policy={editorPolicy}
            values={editorValues}
            fieldIssues={editorFieldIssues}
            disabled={mutation.isSaving}
            onLoadSecret={mutation.editor.loadSecret}
            onValueChange={(fieldId, value) =>
              setEditorValues((current) => ({
                ...current,
                [fieldId]: value,
              }))
            }
          />
        </ChannelEditorShell>
      ) : null}

      <Modal
        isOpen={Boolean(mutation.detail)}
        title={t("channelDialog:title.view")}
        onClose={mutation.closeDetail}
        footer={
          <Button type="button" onClick={mutation.closeDetail}>
            {t("common:actions.close")}
          </Button>
        }
      >
        {mutation.detail ? (
          <ManagedSiteChannelDetailView
            name={mutation.detail.name}
            fields={detailFields}
            missingValue={t("common:labels.notAvailable")}
          />
        ) : null}
      </Modal>

      <ManagedSiteMigrationDialogView
        isOpen={isMigrationOpen}
        selectedTarget={migration.selectedTarget}
        targets={migration.targets}
        preview={migration.preview}
        result={migration.result}
        labels={createMigrationLabels(
          t,
          migrationRowKeys.length,
          migration.preview,
        )}
        isConfirmationOpen={migration.isConfirmationOpen}
        isRunning={migration.isRunning}
        isRecoveryRunning={migration.isRecoveryRunning}
        refreshRequired={migration.refreshRequired}
        callbacks={migration.callbacks}
      />
    </>
  )
}

/** Selects one static managed-resource controller mode for the options route. */
export function ManagedSiteChannelsRoute({
  siteType,
  refreshKey,
  routeParams,
  onReplaceRouteQuery,
}: ManagedSiteChannelsRouteProps) {
  const policy = resolvePolicy(siteType)

  if (!policy) return <ManagedSiteChannelsIntegrationFailure />

  if (policy.mode === MANAGED_RESOURCE_MODES.LegacyChannel) {
    return (
      <ManagedSiteChannels
        siteType={siteType}
        refreshKey={refreshKey}
        routeParams={routeParams}
        onReplaceRouteQuery={onReplaceRouteQuery}
      />
    )
  }

  const registration = getManagedResourceRegistration(
    siteType,
    policy.primaryKind,
  )
  if (!registration) return <ManagedSiteChannelsIntegrationFailure />

  return (
    <NativeManagedSiteChannels
      siteType={siteType}
      refreshKey={refreshKey}
      routeParams={routeParams}
      onReplaceRouteQuery={onReplaceRouteQuery}
      policy={policy}
      registration={registration}
    />
  )
}
