import type { TFunction } from "i18next"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { type ChannelFilterTarget } from "~/features/ManagedSiteChannels/components/ChannelFilterDialog"
import { useManagedResourceMutationController } from "~/features/ManagedSiteChannels/controllers/useManagedResourceMutationController"
import { useManagedResourceEditorPresentation } from "~/features/ManagedSiteChannels/hooks/useManagedResourceEditorPresentation"
import { useManagedSiteChannelModelSync } from "~/features/ManagedSiteChannels/hooks/useManagedSiteChannelModelSync"
import type { ManagedSiteChannelsRouteProps } from "~/features/ManagedSiteChannels/managedSiteChannelsRouteContracts"
import type {
  ManagedChannelsCallbacks,
  ManagedChannelsCapabilities,
  ManagedChannelsPresentationState,
} from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  buildManagedResourceDetailFields,
  createManagedResourceDetailLabels,
} from "~/features/ManagedSiteChannels/presentation/managedResourceDetailPresentation"
import { presentManagedResourceFailure } from "~/features/ManagedSiteChannels/presentation/managedResourceFailurePresentation"
import {
  MANAGED_RESOURCE_EDITOR_MODES,
  type ManagedResourceEditorMode,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import { presentManagedResourceRow } from "~/features/ManagedSiteChannels/presentation/managedResourcePresentation"
import { createManagedResourceColumns } from "~/features/ManagedSiteChannels/presentation/managedResourceTablePolicy"
import { createManagedSiteChannelsLabels } from "~/features/ManagedSiteChannels/presentation/managedSiteChannelsLabels"
import {
  nativeChannelActionAnalyticsContext,
  trackNativeChannelActionStarted,
} from "~/features/ManagedSiteChannels/presentation/nativeChannelActionAnalytics"
import { useManagedSiteChannelPageExperience } from "~/features/ManagedSiteChannels/presentation/useManagedSiteChannelPageExperience"
import { useManagedResourceInteraction } from "~/features/ManagedSiteChannels/providers/useManagedResourceInteraction"
import { recordGatewayGuidanceCompletion } from "~/features/UnifiedApiGuidance/recordGatewayGuidanceCompletion"
import toast from "~/lib/notify"
import type { ManagedResourceProductPolicy } from "~/services/accountSiteDefinitions/contracts"
import { getManagedSiteTypeValues } from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  type ManagedResourceRegistration,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  getManagedResourceRefKey,
  toManagedUpstreamResourceRef,
} from "~/services/managedSites/managedResourceIdentity"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import {
  getManagedSiteLabel,
  getManagedSiteUnsupportedModelSyncMessage,
  supportsManagedSiteModelSync,
} from "~/services/managedSites/utils/managedSite"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"
import {
  openManagedSiteModelSyncForChannel,
  openSettingsTab,
} from "~/utils/navigation"

import { useNativeChannelDeletionFeedback } from "./useNativeChannelDeletionFeedback"
import { useNativeChannelMigration } from "./useNativeChannelMigration"
import { useNativeChannelWorkspace } from "./useNativeChannelWorkspace"

const getFailureMessage = (
  t: TFunction,
  failure: ResourceFailure | null,
  siteLabel: string,
) => {
  if (!failure) return null
  let fallback: {
    category: string
    message: string
  }
  switch (failure.code) {
    case MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed:
      fallback = {
        category: t("managedSiteChannels:alerts.authenticationFailed.title", {
          site: siteLabel,
        }),
        message: t(
          "managedSiteChannels:alerts.authenticationFailed.description",
          { site: siteLabel },
        ),
      }
      break
    case MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied:
      fallback = {
        category: t("managedSiteChannels:alerts.permissionDenied.title", {
          site: siteLabel,
        }),
        message: t("managedSiteChannels:alerts.permissionDenied.description", {
          site: siteLabel,
        }),
      }
      break
    case MANAGED_RESOURCE_FAILURE_CODES.Unavailable:
      fallback = {
        category: t("managedSiteChannels:alerts.unavailable.title", {
          site: siteLabel,
        }),
        message: t("managedSiteChannels:alerts.unavailable.description", {
          site: siteLabel,
        }),
      }
      break
    default:
      fallback = {
        category: t("managedSiteChannels:alerts.loadError.title"),
        message: t("common:rootErrorBoundary.genericDescription"),
      }
  }
  return presentManagedResourceFailure(failure, fallback)
}

/** Composes native controllers with workspace state and presentation commands. */
export function useNativeManagedSiteChannelsViewModel({
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
  const config =
    resolveManagedSiteRuntimeConfigForType(preferences, siteType)?.config ??
    null
  const { runRead, executeMigration, verificationDialog } =
    useManagedResourceInteraction({
      siteType,
      newApiConfig: preferences.newApi,
    })
  const onMutationSuccess = useCallback(
    (mode: ManagedResourceEditorMode) => {
      toast.success(
        mode === MANAGED_RESOURCE_EDITOR_MODES.Create
          ? t("managedSiteChannels:toasts.channelSaved")
          : t("managedSiteChannels:toasts.channelUpdated"),
      )
    },
    [t],
  )
  const [filterTarget, setFilterTarget] = useState<ChannelFilterTarget | null>(
    null,
  )
  const {
    list,
    analytics,
    searchValue,
    setSearchValue,
    sorting,
    setSorting,
    columnVisibility,
    setColumnVisibility,
    pageSize,
    setPageSize,
    presentationSemantics,
    channelIdFilterValue,
    routeResourceMatches,
    routedResourceKey,
  } = useNativeChannelWorkspace({
    siteType,
    refreshKey,
    routeParams,
    onReplaceRouteQuery,
    policy,
    registration,
    config,
  })

  const { syncingResourceKeys, syncChannels } = useManagedSiteChannelModelSync({
    siteType,
    scopeKey: normalizeManagedUpstreamResourceScopeKey(config?.baseUrl ?? ""),
    onModelsChanged: list.reconcile,
  })

  const readEditor = useCallback(
    <T,>(read: () => Promise<T>, signal?: AbortSignal) =>
      runRead(read, t("channelDialog:fields.key.label"), signal),
    [runRead, t],
  )
  const mutation = useManagedResourceMutationController({
    readEditor,
    workspace: list.workspace,
    refresh: list.refreshSilently,
    resolveRef: list.resolveRef,
    mapFacts: list.mapFacts,
    acceptMutationResult: list.acceptMutationResult,
    acceptDeletionResults: list.acceptDeletionResults,
    onMutationSuccess,
    onMutationConfirmed: (mode) => {
      if (mode === MANAGED_RESOURCE_EDITOR_MODES.Create)
        recordGatewayGuidanceCompletion()
    },
    analytics,
  })
  const {
    editorValues,
    setEditorValues,
    editorPolicy,
    editorValidation,
    editorFieldIssues,
    loadEditorSecret,
    loadEditorOptions,
    editorPageFailure,
    handleSubmitEditor,
  } = useManagedResourceEditorPresentation({
    siteType,
    primaryKind: policy.primaryKind,
    mutation,
    runRead,
    t,
  })
  const {
    migrationMode,
    migration,
    isMigrationOpen,
    migrationLabels,
    canMigrate,
    commands: migrationCommands,
    targets,
  } = useNativeChannelMigration({
    siteType,
    config,
    preferences,
    list,
    executeMigration,
    analytics,
    t,
  })

  const columns = useMemo(
    () => createManagedResourceColumns(t, siteType, policy, columnVisibility),
    [columnVisibility, policy, siteType, t],
  )
  const pagination = useMemo(
    () => ({ pageIndex: list.pageIndex, pageSize }),
    [list.pageIndex, pageSize],
  )
  const labels = useMemo(
    () =>
      createManagedSiteChannelsLabels(t, {
        statusLabels: {
          enabled: t("managedSiteChannels:statusLabels.enabled"),
          disabled: t("managedSiteChannels:statusLabels.manualPause"),
          archived: t("managedSiteChannels:editor.options.status.archived"),
          "auto-disabled": t("managedSiteChannels:statusLabels.autoDisabled"),
          unknown: t("managedSiteChannels:statusLabels.unknown"),
        },
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
      }),
    [t],
  )
  const { resolveRef } = list
  const nativeRows = useMemo(
    () =>
      list.allRows
        .filter((row) => {
          if (!routeResourceMatches) return false
          const ref = resolveRef(row.rowKey)
          return routedResourceKey
            ? Boolean(
                ref && getManagedResourceRefKey(ref) === routedResourceKey,
              )
            : !channelIdFilterValue || ref?.resourceId === channelIdFilterValue
        })
        .map((row) => {
          const channelActions = row.channelActions
          return {
            ...presentManagedResourceRow(row, t, presentationSemantics),
            capabilities: {
              ...row.capabilities,
              canMigrate: canMigrate && row.capabilities.canView,
              canSync: channelActions?.canSyncModels === true,
              canOpenSync: channelActions?.canOpenModelSync === true,
              canFilter: channelActions?.canConfigureModelFilters === true,
            },
            isSyncing:
              channelActions !== undefined &&
              Boolean(
                resolveRef(row.rowKey) &&
                  syncingResourceKeys.has(
                    getManagedResourceRefKey(resolveRef(row.rowKey)!),
                  ),
              ),
          }
        }),
    [
      canMigrate,
      channelIdFilterValue,
      routeResourceMatches,
      routedResourceKey,
      list.allRows,
      presentationSemantics,
      resolveRef,
      syncingResourceKeys,
      t,
    ],
  )
  const rowsByKey = useMemo(
    () => new Map(nativeRows.map((row) => [row.rowKey, row])),
    [nativeRows],
  )
  const deletionFeedback = useNativeChannelDeletionFeedback(
    mutation,
    rowsByKey,
    t,
  )
  const { confirmedDeleteLabels } = deletionFeedback

  const detailPageFailure =
    mutation.detailFailure && mutation.opening?.status !== "failure"
      ? presentManagedResourceFailure(mutation.detailFailure, {
          category: t("managedSiteChannels:alerts.loadError.title"),
          message: t("common:rootErrorBoundary.genericDescription"),
        })
      : null
  const failure =
    editorPageFailure ??
    detailPageFailure ??
    getFailureMessage(t, list.failure, getManagedSiteLabel(t, siteType))
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
    channelIdFilterValue,
    statusFilterValues: [...list.statusFilter],
    pagination,
    total: channelIdFilterValue ? nativeRows.length : list.totalRows,
    isLoading: list.isLoading,
    isRefreshing: list.isLoading,
    isResourceInteractionBlocked: mutation.deleteState.requiresFreshRead,
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
        displayLabel:
          rowsByKey.get(result.rowKey)?.name ??
          confirmedDeleteLabels.current.get(result.rowKey) ??
          "",
      })),
      requiresRefresh: mutation.deleteState.requiresRefresh,
      failure: getFailureMessage(
        t,
        mutation.deleteState.failure,
        getManagedSiteLabel(t, siteType),
      ),
    },
  }
  const capabilities: ManagedChannelsCapabilities = {
    canCreate: mutation.capabilities.canCreate,
    canRefresh: true,
    canDeleteSelected: mutation.capabilities.canDelete,
    canSyncSelected: nativeRows.some((row) => row.capabilities.canSync),
    modelSyncUnavailableReason: supportsManagedSiteModelSync(siteType)
      ? undefined
      : getManagedSiteUnsupportedModelSyncMessage(t, siteType),
    canToggleMigration: canMigrate || migrationMode,
    canMigrateSelected: canMigrate,
    canMigrateFiltered: canMigrate,
    hasMigrationTargets: targets.length > 0,
  }
  const callbacks: ManagedChannelsCallbacks = {
    ...migrationCommands,

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
    onEdit: (rowKey) => void mutation.openEdit(rowKey),
    onView: (rowKey) => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.ViewManagedSiteChannel,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      )
      void mutation.openDetail(rowKey)
    },
    onDelete: mutation.openDelete,
    onSync: async (rowKey) => {
      const row = rowsByKey.get(rowKey)
      if (!row?.capabilities.canSync || !row.channelActions) return
      const ref = list.resolveRef(rowKey)
      if (!ref) return
      await syncChannels(
        [ref],
        nativeChannelActionAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.SyncManagedSiteChannel,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
        ),
      )
    },
    onOpenSync: async (rowKey) => {
      const row = rowsByKey.get(rowKey)
      if (!row?.capabilities.canOpenSync || !row.channelActions) return
      void trackProductAnalyticsActionStarted(
        nativeChannelActionAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelModelSync,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
        ),
      )
      const ref = list.resolveRef(rowKey)
      if (ref) await openManagedSiteModelSyncForChannel(ref)
    },
    onFilters: (rowKey) => {
      const row = rowsByKey.get(rowKey)
      if (!row?.capabilities.canFilter || !row.channelActions) return
      const ref = list.resolveRef(rowKey)
      if (!ref) return
      setFilterTarget({
        name: row.name,
        type: String(row.channelActions.channelType),
        resourceRef: toManagedUpstreamResourceRef(ref),
      })
      void trackProductAnalyticsActionStarted(
        nativeChannelActionAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelFilters,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
        ),
      )
    },
    onDeleteSelected: () => {
      void mutation.openBulkDelete(
        Object.keys(list.selectedRowKeys).filter(
          (rowKey) =>
            list.selectedRowKeys[rowKey] &&
            (!channelIdFilterValue || rowsByKey.has(rowKey)),
        ),
      )
    },
    onSyncSelected: async (rowKeys) => {
      const resourceRefs = rowKeys.flatMap((rowKey) => {
        const row = rowsByKey.get(rowKey)
        const ref = list.resolveRef(rowKey)
        return row?.capabilities.canSync && row.channelActions && ref
          ? [ref]
          : []
      })
      await syncChannels(
        resourceRefs,
        nativeChannelActionAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteChannels,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
        ),
      )
    },
    onDeleteConfirm: deletionFeedback.confirmDelete,
    onDeleteCancel: mutation.cancelDelete,
  }

  const detailRow = mutation.detail
    ? presentManagedResourceRow(mutation.detail, t, presentationSemantics)
    : null
  const detailLabels = useMemo(
    () =>
      createManagedResourceDetailLabels(
        siteType,
        policy.primaryKind,
        columns,
        t,
      ),
    [columns, policy.primaryKind, siteType, t],
  )
  const detailFields = detailRow
    ? buildManagedResourceDetailFields(
        detailRow,
        policy.detailFieldIds,
        detailLabels,
      )
    : []
  const pageExperience = useManagedSiteChannelPageExperience({
    siteType,
    baseUrl: config?.baseUrl,
    isConfigurationMissing,
    isLoadedEmpty:
      !list.isLoading &&
      !list.failure &&
      !searchValue.trim() &&
      !channelIdFilterValue &&
      list.statusFilter.length === 0 &&
      list.totalRows === 0,
    canImportChannel:
      capabilities.canCreate &&
      registration.createSeedKinds?.includes(
        MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      ) === true,
  })
  return {
    verificationDialog,
    isMigrationOpen,
    filterTarget,
    setFilterTarget,
    editorValues,
    setEditorValues,
    mutation,
    loadEditorSecret,
    loadEditorOptions,
    migration,
    editorPolicy,
    editorValidation,
    editorFieldIssues,
    labels,
    state,
    capabilities,
    callbacks,
    detailFields,
    pageExperience,
    handleSubmitEditor,
    migrationLabels,
  }
}
