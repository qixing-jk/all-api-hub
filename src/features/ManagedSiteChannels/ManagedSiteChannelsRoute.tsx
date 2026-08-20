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
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRegistration,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import {
  getManagedSiteAdminConfigForType,
  getManagedSiteConfigMissingMessage,
  getManagedSiteLabel,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteTargetOptions,
} from "~/services/managedSites/utils/managedSite"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import {
  openManagedSiteModelSyncForChannel,
  openSettingsTab,
} from "~/utils/navigation"

import ChannelFilterDialog, {
  type ChannelFilterTarget,
} from "./components/ChannelFilterDialog"
import { useManagedResourceListController } from "./controllers/useManagedResourceListController"
import { useManagedResourceMigrationController } from "./controllers/useManagedResourceMigrationController"
import { useManagedResourceMutationController } from "./controllers/useManagedResourceMutationController"
import { useManagedSiteChannelModelSync } from "./hooks/useManagedSiteChannelModelSync"
import ManagedSiteChannels from "./ManagedSiteChannels"
import type {
  ManagedChannelsCallbacks,
  ManagedChannelsCapabilities,
  ManagedChannelsPresentationState,
  ManagedSiteMigrationLabels,
} from "./presentation/contracts"
import { ManagedResourceEditorBody } from "./presentation/ManagedResourceEditorBody"
import { presentManagedResourceFailure } from "./presentation/managedResourceFailurePresentation"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
  type ManagedResourceEditorMode,
} from "./presentation/managedResourceFieldPolicy"
import {
  createManagedResourceColumns,
  getDefaultManagedResourceSorting,
  getManagedResourcePresentationSemantics,
} from "./presentation/managedResourceTablePolicy"
import { ManagedSiteChannelDetailView } from "./presentation/ManagedSiteChannelDetailView"
import { createManagedSiteChannelsLabels } from "./presentation/managedSiteChannelsLabels"
import { ManagedSiteChannelsView } from "./presentation/ManagedSiteChannelsView"
import { ManagedSiteMigrationDialogView } from "./presentation/ManagedSiteMigrationDialogView"
import { useManagedSiteChannelPageExperience } from "./presentation/useManagedSiteChannelPageExperience"
import { useManagedResourceInteraction } from "./providers/useManagedResourceInteraction"

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

const nativeChannelActionAnalyticsContext = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) => ({
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
  actionId,
  surfaceId,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
})

const trackNativeChannelActionStarted = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) =>
  void trackProductAnalyticsActionStarted(
    nativeChannelActionAnalyticsContext(actionId, surfaceId),
  )

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

const createMigrationLabels = (
  t: TFunction,
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
  const { runRead, executeMigration, verificationDialog } =
    useManagedResourceInteraction({
      siteType,
      newApiConfig: preferences.newApi,
    })
  const latestRouteParams = useRef(routeParams)
  const latestTranslate = useRef(t)
  useEffect(() => {
    latestRouteParams.current = routeParams
    latestTranslate.current = t
  }, [routeParams, t])
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
    (mode: ManagedResourceEditorMode) =>
      toast.success(
        t(
          mode === MANAGED_RESOURCE_EDITOR_MODES.Create
            ? "managedSiteChannels:toasts.channelSaved"
            : "managedSiteChannels:toasts.channelUpdated",
        ),
      ),
    [t],
  )
  const [searchValue, setSearchValue] = useState(routeParams.search ?? "")
  const [sorting, setSorting] = useState(() =>
    getDefaultManagedResourceSorting(siteType),
  )
  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >({})
  const [pageSize, setPageSize] = useState(10)
  const [migrationMode, setMigrationMode] = useState(false)
  const [migrationRowKeys, setMigrationRowKeys] = useState<string[]>([])
  const [isMigrationOpen, setIsMigrationOpen] = useState(false)
  const [filterTarget, setFilterTarget] = useState<ChannelFilterTarget | null>(
    null,
  )
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
  useEffect(
    () => setSorting(getDefaultManagedResourceSorting(siteType)),
    [siteType],
  )
  const list = useManagedResourceListController({
    registration,
    scopeKey: config?.baseUrl ?? `${siteType}:configuration-missing`,
    search: searchValue,
    refreshKey,
    pageSize,
    onUnsupportedSearch,
    resolveLabel,
    fieldIds: policy.tableFieldIds,
    semantics: getManagedResourcePresentationSemantics(siteType),
    analytics,
  })
  const { syncingChannelIds, syncChannels } = useManagedSiteChannelModelSync({
    siteType,
    onModelsChanged: list.reconcile,
  })
  const mutation = useManagedResourceMutationController({
    workspace: list.workspace,
    refresh: list.refreshSilently,
    resolveRef: list.resolveRef,
    mapFacts: list.mapFacts,
    acceptMutationResult: list.acceptMutationResult,
    acceptDeletionResults: list.acceptDeletionResults,
    onMutationSuccess,
    analytics,
  })
  useEffect(() => {
    setEditorValues(mutation.editor?.initialValues ?? {})
  }, [mutation.editor])
  const editorSecretLoader = mutation.editor?.loadSecret
  const editorOptionLoader = mutation.editor?.loadOptions
  const loadEditorSecret = useCallback(
    async (fieldId: string, options?: ResourceOperationOptions) => {
      if (!editorSecretLoader) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        })
      }
      return await runRead(
        () => editorSecretLoader(fieldId, options),
        t("channelDialog:title.edit"),
        options?.signal,
      )
    },
    [editorSecretLoader, runRead, t],
  )
  const loadEditorOptions = useCallback(
    async (
      fieldId: string,
      values: EditableResourceProjection,
      options?: ResourceOperationOptions,
    ) => {
      if (!editorOptionLoader) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        })
      }
      return await runRead(
        () => editorOptionLoader(fieldId, values, options),
        t("channelDialog:title.edit"),
        options?.signal,
      )
    },
    [editorOptionLoader, runRead, t],
  )
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
    executeMigration,
  })
  const editorPolicy =
    mutation.editor && mutation.editorMode
      ? getManagedResourceFieldPolicy(
          siteType,
          policy.primaryKind,
          mutation.editorMode,
        )
      : undefined
  const editorValidation = mutation.editor?.validate(editorValues) ?? null
  const liveEditorValidation =
    mutation.editorFailure?.code ===
    MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed
      ? editorValidation
      : null
  const editorFieldIssues = liveEditorValidation
    ? liveEditorValidation.valid
      ? []
      : liveEditorValidation.issues
    : mutation.editorFailure?.fieldIssues
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
  const canMigrate =
    policy.actions.includes(MANAGED_RESOURCE_PRODUCT_ACTIONS.Migrate) &&
    targets.length > 0
  const canSyncModels = policy.actions.includes(
    MANAGED_RESOURCE_PRODUCT_ACTIONS.SyncModels,
  )
  const canConfigureModelSync = policy.actions.includes(
    MANAGED_RESOURCE_PRODUCT_ACTIONS.ConfigureModelSync,
  )
  const canConfigureModelFilters = policy.actions.includes(
    MANAGED_RESOURCE_PRODUCT_ACTIONS.ConfigureModelFilters,
  )
  const nativeRows = useMemo(
    () =>
      list.allRows.map((row) => {
        const channelActions = row.channelActions
        return {
          ...row,
          capabilities: {
            ...row.capabilities,
            canMigrate: canMigrate && row.capabilities.canView,
            canSync: canSyncModels && channelActions?.canSyncModels === true,
            canOpenSync:
              canConfigureModelSync &&
              channelActions?.canOpenModelSync === true,
            canFilter:
              canConfigureModelFilters &&
              channelActions?.canConfigureModelFilters === true,
          },
          isSyncing:
            channelActions !== undefined &&
            syncingChannelIds.has(channelActions.channelId),
        }
      }),
    [
      canConfigureModelFilters,
      canConfigureModelSync,
      canMigrate,
      canSyncModels,
      list.allRows,
      syncingChannelIds,
    ],
  )
  const rowsByKey = useMemo(
    () => new Map(nativeRows.map((row) => [row.rowKey, row])),
    [nativeRows],
  )
  const confirmedDeleteLabels = useRef(new Map<string, string>())
  const editorPageFailure = (() => {
    switch (mutation.editorFeedback?.kind) {
      case "open-failed":
        return presentManagedResourceFailure(mutation.editorFeedback.failure, {
          category: t("managedSiteChannels:alerts.editorLoadError.title"),
          message: t("managedSiteChannels:alerts.editorLoadError.description"),
        })
      case "save-failed":
        return mutation.editor === null
          ? presentManagedResourceFailure(mutation.editorFeedback.failure, {
              category: t("managedSiteChannels:alerts.editorSaveError.title"),
              message: t(
                "managedSiteChannels:alerts.editorSaveError.description",
              ),
            })
          : null
      case "save-uncertain":
        return presentManagedResourceFailure(mutation.editorFeedback.failure, {
          category: t("managedSiteChannels:alerts.partialMutation.title"),
          message: t("managedSiteChannels:alerts.partialMutation.description"),
        })
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
  const detailPageFailure = mutation.detailFailure
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
    channelIdFilterValue: routeParams.channelId ?? "",
    statusFilterValues: [...list.statusFilter],
    pagination,
    total: list.totalRows,
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
    canCreate:
      mutation.capabilities.canCreate &&
      policy.actions.includes(MANAGED_RESOURCE_PRODUCT_ACTIONS.Create),
    canRefresh: true,
    canDeleteSelected:
      mutation.capabilities.canDelete &&
      policy.actions.includes(MANAGED_RESOURCE_PRODUCT_ACTIONS.DeleteSelected),
    canSyncSelected: nativeRows.some((row) => row.capabilities.canSync),
    canToggleMigration: canMigrate || migrationMode,
    canMigrateSelected: canMigrate,
    canMigrateFiltered: canMigrate,
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
    onToggleMigrationMode: () => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.ToggleManagedSiteChannelMigrationMode,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      )
      setMigrationMode((current) => !current)
    },
    onMigrateSelected: (rowKeys) => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.OpenSelectedManagedSiteChannelMigration,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      )
      setMigrationRowKeys(rowKeys)
      setIsMigrationOpen(true)
    },
    onMigrateFiltered: (rowKeys) => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.OpenFilteredManagedSiteChannelMigration,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      )
      setMigrationRowKeys(rowKeys)
      setIsMigrationOpen(true)
    },
    onEdit: (rowKey) => void mutation.openEdit(rowKey),
    onView: (rowKey) => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.ViewManagedSiteChannel,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      )
      void mutation.openDetail(rowKey)
    },
    onMigrate: (rowKey) => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelMigration,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      )
      setMigrationRowKeys([rowKey])
      setIsMigrationOpen(true)
    },
    onDelete: mutation.openDelete,
    onSync: async (rowKey) => {
      const row = rowsByKey.get(rowKey)
      if (!row?.capabilities.canSync || !row.channelActions) return
      await syncChannels(
        [row.channelActions.channelId],
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
      await openManagedSiteModelSyncForChannel(row.channelActions.channelId)
    },
    onFilters: (rowKey) => {
      const row = rowsByKey.get(rowKey)
      if (!row?.capabilities.canFilter || !row.channelActions) return
      const ref = list.resolveRef(rowKey)
      if (!ref) return
      setFilterTarget({
        id: row.channelActions.channelId,
        name: row.name,
        type: String(row.channelActions.channelType),
        resourceRef: createManagedUpstreamResourceRef({
          managedSiteType: ref.siteType,
          scopeKey: ref.scopeKey,
          resourceId: ref.resourceId,
        }),
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
          (rowKey) => list.selectedRowKeys[rowKey],
        ),
      )
    },
    onSyncSelected: async (rowKeys) => {
      const channelIds = rowKeys.flatMap((rowKey) => {
        const row = rowsByKey.get(rowKey)
        return row?.capabilities.canSync && row.channelActions
          ? [row.channelActions.channelId]
          : []
      })
      await syncChannels(
        channelIds,
        nativeChannelActionAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteChannels,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
        ),
      )
    },
    onDeleteConfirm: () => {
      confirmedDeleteLabels.current = new Map(
        mutation.deleteState.rowKeys.flatMap((rowKey) => {
          const row = rowsByKey.get(rowKey)
          return row ? [[rowKey, row.name] as const] : []
        }),
      )
      void mutation.confirmDelete()
    },
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
  const pageExperience = useManagedSiteChannelPageExperience({
    siteType,
    baseUrl: config?.baseUrl,
    isConfigurationMissing,
    isLoadedEmpty:
      !list.isLoading &&
      !list.failure &&
      !searchValue.trim() &&
      !routeParams.channelId?.trim() &&
      list.statusFilter.length === 0 &&
      list.totalRows === 0,
    canImportChannel:
      capabilities.canCreate &&
      registration.createSeedKinds?.includes(
        MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      ) === true,
  })

  return (
    <>
      <ManagedSiteChannelsView
        state={state}
        capabilities={capabilities}
        callbacks={callbacks}
        labels={labels}
        title={t(policy.titleKey)}
        titleActions={pageExperience.titleActions}
        description={pageExperience.description}
        configurationMissingDescription={getManagedSiteConfigMissingMessage(
          t,
          getManagedSiteMessagesKeyFromSiteType(siteType),
        )}
        configurationMissingNotice={pageExperience.configurationMissingNotice}
        emptyContent={pageExperience.emptyContent}
        configurationSettingsTarget={policy.settingsTarget}
        siteTypeLabel={t("settings:managedSite.siteTypeLabel")}
        filterDialog={
          <ChannelFilterDialog
            channel={filterTarget}
            open={filterTarget !== null}
            onClose={() => setFilterTarget(null)}
          />
        }
      />

      {mutation.editor && mutation.editorMode && editorPolicy ? (
        <ChannelEditorShell
          isOpen
          title={t(
            mutation.editorMode === MANAGED_RESOURCE_EDITOR_MODES.Create
              ? "channelDialog:title.add"
              : "channelDialog:title.edit",
          )}
          description={t(
            mutation.editorMode === MANAGED_RESOURCE_EDITOR_MODES.Create
              ? "channelDialog:description.add"
              : "channelDialog:description.edit",
          )}
          onClose={mutation.closeEditor}
          onSubmit={(event) => {
            event.preventDefault()
            void mutation.submit(editorValues)
          }}
          submitLabel={t(
            mutation.editorMode === MANAGED_RESOURCE_EDITOR_MODES.Create
              ? "channelDialog:actions.create"
              : "channelDialog:actions.update",
          )}
          closeLabel={t("common:actions.cancel")}
          submitTestId={CHANNEL_DIALOG_TEST_IDS.submitButton}
          isSubmitting={mutation.isSaving}
          isSubmitDisabled={editorValidation?.valid === false}
          noValidate
        >
          {mutation.editorFeedback?.kind === "save-failed" &&
          mutation.editorFeedback.failure.code !==
            MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>
                {t("managedSiteChannels:alerts.editorSaveError.title")}
              </AlertTitle>
              <AlertDescription className="whitespace-pre-line">
                {
                  presentManagedResourceFailure(
                    mutation.editorFeedback.failure,
                    {
                      category: "",
                      message: t(
                        "managedSiteChannels:alerts.editorSaveError.description",
                      ),
                    },
                  ).message
                }
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
            onLoadSecret={
              mutation.editor.loadSecret ? loadEditorSecret : undefined
            }
            onLoadOptions={
              mutation.editor.loadOptions ? loadEditorOptions : undefined
            }
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

      {verificationDialog}

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
      key={siteType}
      siteType={siteType}
      refreshKey={refreshKey}
      routeParams={routeParams}
      onReplaceRouteQuery={onReplaceRouteQuery}
      policy={policy}
      registration={registration}
    />
  )
}
