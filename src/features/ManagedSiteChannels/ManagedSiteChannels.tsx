import {
  ColumnFiltersState,
  PaginationState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"
import type { TFunction } from "i18next"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import Tooltip from "~/components/Tooltip"
import { Button, IconButton, Notice } from "~/components/ui"
import { AxonHubChannelTypeNames } from "~/constants/axonHub"
import { ClaudeCodeHubProviderTypeNames } from "~/constants/claudeCodeHub"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { ChannelTypeNames } from "~/constants/managedSite"
import { OctopusOutboundTypeNames } from "~/constants/octopus"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { buildGuidedAccountKeyImportTarget } from "~/features/UnifiedApiGuidance/navigation"
import { accountStorage } from "~/services/accounts/accountStorage"
import { canResolveAccountRuntimeKeySecret } from "~/services/accounts/keyProductCapabilities"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  buildManagedSiteChannelConsoleUrl,
  buildManagedSiteTokenConsoleUrl,
} from "~/services/managedSites/managedSiteConsoleRoutes"
import {
  getManagedSiteService,
  hasValidManagedSiteConfig,
} from "~/services/managedSites/managedSiteService"
import { resolveManagedUpstreamResourceCapabilities } from "~/services/managedSites/managedUpstreamResourceService"
import { toPrivateManagedSiteThrownErrorMessage } from "~/services/managedSites/mutations"
import {
  collectManagedResourceSecrets,
  getManagedSiteAdminConfigForType,
  getManagedSiteConfigMissingMessage,
  getManagedSiteLabel,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteTargetOptions,
  needsManagedSiteChannelKeyResolution,
} from "~/services/managedSites/utils/managedSite"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionCompleted,
  trackProductAnalyticsActionStarted,
  type ProductAnalyticsActionContext,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ExecutionItemResult } from "~/types/managedSiteModelSync"
import {
  createManagedUpstreamResourceRef,
  normalizeManagedUpstreamResourceScopeKey,
} from "~/types/managedUpstreamResource"
import { createTab } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import {
  navigateWithinOptionsPage,
  openManagedSiteModelSyncForChannel,
  openSettingsTab,
  pushWithinOptionsPage,
} from "~/utils/navigation"

import ChannelFilterDialog from "./components/ChannelFilterDialog"
import { ManagedSiteChannelMigrationDialog } from "./components/ManagedSiteChannelMigrationDialog"
import type { RowActionsLabels } from "./components/RowActions"
import {
  LEGACY_MANAGED_RESOURCE_DELETE_FAILED_FALLBACK,
  LegacyManagedResourceBulkDeleteController,
  type LegacyManagedResourceDeleteResult,
  type LegacyManagedResourceDeleteTarget,
} from "./controllers/legacyManagedResourceBulkDeleteController"
import type {
  ManagedChannelsCallbacks,
  ManagedChannelsCapabilities,
  ManagedChannelsColumn,
  ManagedChannelsLabels,
  ManagedChannelsPresentationState,
  ManagedChannelsRowViewModel,
} from "./presentation/contracts"
import { ManagedSiteChannelsView } from "./presentation/ManagedSiteChannelsView"
import type { ChannelRow } from "./types"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const channelsToolbarSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar
const channelsRowActionsSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions
const logger = createLogger("ManagedSiteChannels")

const MANAGED_SITE_TYPE_OPTIONS: ManagedSiteType[] = [
  SITE_TYPES.NEW_API,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.VELOERA,
  SITE_TYPES.OCTOPUS,
  SITE_TYPES.AXON_HUB,
  SITE_TYPES.CLAUDE_CODE_HUB,
]

const normalizeRouteQuery = (
  query: Readonly<Record<string, string | undefined>>,
) =>
  Object.fromEntries(
    Object.entries(query).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )

const areRouteQueriesEqual = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
) => {
  const leftEntries = Object.entries(left)
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([key, value]) => right[key] === value)
  )
}

const trackManagedSiteChannelAction = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) => {
  void trackProductAnalyticsActionStarted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
    actionId,
    surfaceId,
    entrypoint: optionsEntrypoint,
  })
}

const trackManagedSiteChannelRowAction = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
) => trackManagedSiteChannelAction(actionId, channelsRowActionsSurface)

const trackManagedSiteChannelToolbarAction = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
) => trackManagedSiteChannelAction(actionId, channelsToolbarSurface)

type RefreshAnalyticsCompletion = {
  complete: ReturnType<typeof startProductAnalyticsAction>["complete"]
  completed: boolean
}

const REFRESH_ABORT_SOURCES = {
  User: "user",
  Superseded: "superseded",
  Cleanup: "cleanup",
} as const

type RefreshAbortSource =
  (typeof REFRESH_ABORT_SOURCES)[keyof typeof REFRESH_ABORT_SOURCES]

type ActiveRefresh = {
  controller: AbortController
  abortSource: RefreshAbortSource | null
}

/**
 * Checks whether a mutation response already contains a table-ready channel row.
 */
export function isChannelRowLike(value: unknown): value is ChannelRow {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<ChannelRow>
  return (
    typeof candidate.id === "number" &&
    typeof candidate.name === "string" &&
    (typeof candidate.type === "string" ||
      typeof candidate.type === "number") &&
    typeof candidate.key === "string" &&
    typeof candidate.base_url === "string" &&
    typeof candidate.models === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.priority === "number" &&
    typeof candidate.weight === "number" &&
    typeof candidate.group === "string"
  )
}

/**
 * Inserts or replaces a channel row returned by create/update mutations.
 */
export function upsertChannelRow(rows: ChannelRow[], channel: ChannelRow) {
  const existingIndex = rows.findIndex((row) => row.id === channel.id)
  if (existingIndex === -1) {
    return [channel, ...rows]
  }

  const existing = rows[existingIndex]
  const nextChannel =
    channel.resourceRef || !existing.resourceRef
      ? channel
      : { ...channel, resourceRef: existing.resourceRef }

  return rows.map((row, index) => (index === existingIndex ? nextChannel : row))
}

/**
 * Main management page for New API channels including table, filters, and dialogs.
 * Fetches channel data, exposes filtering tools, and handles CRUD operations.
 */
interface ManagedSiteChannelsProps {
  siteType?: ManagedSiteType
  refreshKey?: number
  routeParams?: Record<string, string>
  onReplaceRouteQuery?: (query: Record<string, string | undefined>) => void
}

/**
 * Resolve the localized status label shown in the status-filter popover.
 */
function getManagedSiteChannelStatusFilterLabel(t: TFunction, value: string) {
  switch (value) {
    case "1":
      return t("managedSiteChannels:statusLabels.enabled")
    case "2":
      return t("managedSiteChannels:statusLabels.manualPause")
    case "3":
      return t("managedSiteChannels:statusLabels.autoDisabled")
    case "0":
    default:
      return t("managedSiteChannels:statusLabels.unknown")
  }
}

const getManagedUpstreamResourceId = (
  managedSiteType: ManagedSiteType,
  channel: ChannelRow,
) => {
  if (managedSiteType === SITE_TYPES.AXON_HUB) {
    const nativeId = (
      channel as ChannelRow & { _axonHubData?: { id?: string | number } }
    )._axonHubData?.id
    if (nativeId !== undefined && nativeId !== null) {
      return nativeId
    }
  }

  return channel.id
}

export const attachChannelFilterResourceRef = (params: {
  channel: ChannelRow
  managedSiteType: ManagedSiteType
  baseUrl: string
}): ChannelRow => {
  const { channel, managedSiteType, baseUrl } = params
  const scopeKey = normalizeManagedUpstreamResourceScopeKey(baseUrl)

  if (!scopeKey) {
    return channel
  }

  return {
    ...channel,
    resourceRef: createManagedUpstreamResourceRef({
      managedSiteType,
      scopeKey,
      resourceId: getManagedUpstreamResourceId(managedSiteType, channel),
    }),
  }
}

const attachChannelFilterResourceRefs = (params: {
  channels: ChannelRow[]
  managedSiteType: ManagedSiteType
  baseUrl: string
}): ChannelRow[] => {
  const { channels, managedSiteType, baseUrl } = params
  return channels.map((channel) =>
    attachChannelFilterResourceRef({
      channel,
      managedSiteType,
      baseUrl,
    }),
  )
}

/**
 * Render the managed site channels page with data loading, filtering, and actions.
 */
export default function ManagedSiteChannels({
  siteType,
  refreshKey,
  routeParams,
  onReplaceRouteQuery,
}: ManagedSiteChannelsProps) {
  const { t } = useTranslation([
    "managedSiteChannels",
    "messages",
    "common",
    "settings",
  ])
  const {
    preferences,
    managedSiteType: contextManagedSiteType,
    newApiBaseUrl,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
    markGatewayGuidanceOnboardingCompleted,
    updateManagedSiteType,
  } = useUserPreferencesContext()
  const managedSiteType = siteType ?? contextManagedSiteType
  const isOctopus = managedSiteType === SITE_TYPES.OCTOPUS
  const isAxonHub = managedSiteType === SITE_TYPES.AXON_HUB
  const isClaudeCodeHub = managedSiteType === SITE_TYPES.CLAUDE_CODE_HUB
  // Migration has provider-specific create-only adapters; New API-only channel
  // controls stay gated separately below.
  const supportsChannelMigration = true
  const supportsNewApiOnlyChannelActions = !isAxonHub && !isClaudeCodeHub
  const isNewApiManagedSite = managedSiteType === SITE_TYPES.NEW_API
  const supportsDetailBackedRealKeyLoading =
    managedSiteType === SITE_TYPES.DONE_HUB ||
    managedSiteType === SITE_TYPES.VELOERA ||
    managedSiteType === SITE_TYPES.CLAUDE_CODE_HUB
  const isConfigMissing = !hasValidManagedSiteConfig(
    preferences,
    managedSiteType,
  )
  const managedSiteAnalyticsType =
    resolveProductAnalyticsManagedSiteType(managedSiteType)
  const managedSiteBaseUrl =
    getManagedSiteAdminConfigForType(preferences, managedSiteType)?.baseUrl ??
    ""
  const managedSiteTokenConsoleUrl = buildManagedSiteTokenConsoleUrl(
    managedSiteBaseUrl,
    managedSiteType,
  )
  const managedSiteChannelConsoleUrl = buildManagedSiteChannelConsoleUrl(
    managedSiteBaseUrl,
    managedSiteType,
  )
  const openManagedSiteChannelConsole = () => {
    if (!managedSiteChannelConsoleUrl) return
    void createTab(managedSiteChannelConsoleUrl, true)
  }

  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCompletedInitialChannelLoad, setHasCompletedInitialChannelLoad] =
    useState(false)
  const [gatewayGuidanceImportAccountId, setGatewayGuidanceImportAccountId] =
    useState<string | undefined>()
  const [hasGatewayGuidanceProfiles, setHasGatewayGuidanceProfiles] =
    useState(false)
  const [
    isGatewayGuidanceSourceInventoryLoaded,
    setIsGatewayGuidanceSourceInventoryLoaded,
  ] = useState(false)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    base_url: false,
    group: !isOctopus && !isAxonHub,
    priority: !isOctopus && !isAxonHub,
    weight: !isOctopus && !isAxonHub,
  })
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [sorting, setSorting] = useState<SortingState>([
    { id: "id", desc: true },
  ])
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [bulkDeleteController] = useState(
    () => new LegacyManagedResourceBulkDeleteController(),
  )
  const [pendingDeleteTargets, setPendingDeleteTargets] = useState<
    LegacyManagedResourceDeleteTarget[]
  >([])
  const [deleteResults, setDeleteResults] = useState<
    LegacyManagedResourceDeleteResult[]
  >([])
  const [deleteRequiresRefresh, setDeleteRequiresRefresh] = useState(false)
  const [pendingDeleteAnalyticsContext, setPendingDeleteAnalyticsContext] =
    useState<ProductAnalyticsActionContext | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [syncingIds, setSyncingIds] = useState<Set<number>>(new Set())
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)
  const [filterDialogChannel, setFilterDialogChannel] =
    useState<ChannelRow | null>(null)
  const [migrationChannels, setMigrationChannels] = useState<ChannelRow[]>([])
  const [isMigrationDialogOpen, setIsMigrationDialogOpen] = useState(false)
  const [isMigrationMode, setIsMigrationMode] = useState(false)
  const currentManagedSiteTypeRef = useRef(managedSiteType)
  const activeRefreshRef = useRef<ActiveRefresh | null>(null)
  const channelFilterResourceScopeBaseUrlRef = useRef("")
  const deleteScopeGenerationRef = useRef(0)
  const editOpenGenerationRef = useRef(0)
  const refreshAnalyticsCompletionRef =
    useRef<RefreshAnalyticsCompletion | null>(null)
  const verification = useNewApiManagedVerification()
  const { openNewApiManagedVerification } = verification

  const { openWithCustom } = useChannelDialog()
  const migrationTargets = useMemo(
    () =>
      supportsChannelMigration
        ? getManagedSiteTargetOptions(preferences, {
            excludeSiteTypes: [managedSiteType],
          })
        : [],
    [managedSiteType, preferences, supportsChannelMigration],
  )
  const hasMigrationTargets = migrationTargets.length > 0

  useEffect(() => {
    let isCurrent = true

    const loadGatewayGuidanceSources = async () => {
      const [accounts, profiles] = await Promise.all([
        accountStorage.getAllAccounts().catch((error) => {
          logger.warn(
            "Failed to load account context for gateway guidance",
            error,
          )
          return []
        }),
        apiCredentialProfilesStorage.listProfiles().catch((error) => {
          logger.warn(
            "Failed to load API credential context for gateway guidance",
            error,
          )
          return []
        }),
      ])
      if (!isCurrent) return

      const displayAccounts = accountStorage.convertToDisplayData(accounts)
      setGatewayGuidanceImportAccountId(
        displayAccounts.find(canResolveAccountRuntimeKeySecret)?.id,
      )
      setHasGatewayGuidanceProfiles(profiles.length > 0)
      setIsGatewayGuidanceSourceInventoryLoaded(true)
    }

    void loadGatewayGuidanceSources()
    return () => {
      isCurrent = false
    }
  }, [])

  const handleOpenGatewayChannelImport = useCallback(() => {
    const target = buildGuidedAccountKeyImportTarget(
      gatewayGuidanceImportAccountId,
    )
    pushWithinOptionsPage(`#${target.menuItemId}`, target.params)
  }, [gatewayGuidanceImportAccountId])

  const handleOpenApiCredentialProfiles = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`, {
      [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
        KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
    })
  }, [])

  const refreshChannels = useCallback(
    async (analyticsContext?: ProductAnalyticsActionContext) => {
      const tracker = analyticsContext
        ? startProductAnalyticsAction(analyticsContext)
        : null
      const analyticsCompletion: RefreshAnalyticsCompletion | null = tracker
        ? {
            complete: tracker.complete,
            completed: false,
          }
        : null
      refreshAnalyticsCompletionRef.current = analyticsCompletion

      const completeAnalytics = (
        result: Parameters<RefreshAnalyticsCompletion["complete"]>[0],
        options: Parameters<RefreshAnalyticsCompletion["complete"]>[1],
      ) => {
        if (!analyticsCompletion || analyticsCompletion.completed) {
          return
        }

        analyticsCompletion.complete(result, options)
        analyticsCompletion.completed = true
      }

      if (isConfigMissing) {
        setChannels([])
        setError(null)
        setIsLoading(false)
        setHasCompletedInitialChannelLoad(false)
        tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          insights: {
            itemCount: 0,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
        return false
      }

      if (activeRefreshRef.current) {
        activeRefreshRef.current.abortSource = REFRESH_ABORT_SOURCES.Superseded
        activeRefreshRef.current.controller.abort()
      }
      const refreshAbortController = new AbortController()
      const activeRefresh: ActiveRefresh = {
        controller: refreshAbortController,
        abortSource: null,
      }
      activeRefreshRef.current = activeRefresh

      setIsLoading(true)
      setError(null)
      try {
        const service = await getManagedSiteService()
        const config = await service.getConfig()
        if (!config) {
          throw new Error(
            getManagedSiteConfigMissingMessage(t, service.messagesKey),
          )
        }

        const response = await service.listChannels(config, {
          signal: refreshAbortController.signal,
        })
        const resourceScopeBaseUrl = String(
          (config as { baseUrl?: string }).baseUrl ?? "",
        )
        const items = attachChannelFilterResourceRefs({
          channels: response.items ?? [],
          managedSiteType,
          baseUrl: resourceScopeBaseUrl,
        })
        if (
          activeRefreshRef.current !== activeRefresh ||
          refreshAbortController.signal.aborted ||
          currentManagedSiteTypeRef.current !== managedSiteType
        ) {
          completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
            insights: {
              failureReason:
                PRODUCT_ANALYTICS_FAILURE_REASONS.StaleResponseIgnored,
              managedSiteType: managedSiteAnalyticsType,
            },
          })
          return false
        }

        channelFilterResourceScopeBaseUrlRef.current = resourceScopeBaseUrl
        setChannels(items)
        const acceptedRowKeys = new Set(items.map((item) => String(item.id)))
        setRowSelection((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([rowKey]) =>
              acceptedRowKeys.has(rowKey),
            ),
          ),
        )
        if (items.length > 0) {
          void Promise.resolve(markGatewayGuidanceOnboardingCompleted()).catch(
            (error) => {
              logger.warn(
                "Failed to mark gateway guidance onboarding complete.",
                error,
              )
            },
          )
        }
        setHasCompletedInitialChannelLoad(true)
        completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: items.length,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
        bulkDeleteController.markRefreshAccepted()
        setDeleteRequiresRefresh(false)
        return true
      } catch (err) {
        const isStaleRefresh =
          activeRefreshRef.current !== activeRefresh ||
          currentManagedSiteTypeRef.current !== managedSiteType
        if (refreshAbortController.signal.aborted || isStaleRefresh) {
          completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
            insights: {
              failureReason:
                refreshAbortController.signal.aborted &&
                activeRefresh.abortSource === REFRESH_ABORT_SOURCES.User
                  ? PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser
                  : PRODUCT_ANALYTICS_FAILURE_REASONS.StaleResponseIgnored,
              managedSiteType: managedSiteAnalyticsType,
            },
          })
          return false
        }

        const message = getErrorMessage(err)
        setError(message)
        toast.error(t("alerts.loadError.description", { error: message }))
        completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            managedSiteType: managedSiteAnalyticsType,
          },
        })
        return false
      } finally {
        if (activeRefreshRef.current === activeRefresh) {
          activeRefreshRef.current = null
          setIsLoading(false)
        }
        if (
          refreshAnalyticsCompletionRef.current === analyticsCompletion &&
          analyticsCompletion?.completed
        ) {
          refreshAnalyticsCompletionRef.current = null
        }
      }
    },
    [
      bulkDeleteController,
      isConfigMissing,
      managedSiteAnalyticsType,
      managedSiteType,
      markGatewayGuidanceOnboardingCompleted,
      t,
    ],
  )

  const cancelRefresh = useCallback(() => {
    const activeRefresh = activeRefreshRef.current
    if (activeRefresh) {
      activeRefresh.abortSource = REFRESH_ABORT_SOURCES.User
      activeRefresh.controller.abort()
      activeRefreshRef.current = null
    }
    const completion = refreshAnalyticsCompletionRef.current
    if (completion && !completion.completed) {
      completion.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
        insights: {
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
          managedSiteType: managedSiteAnalyticsType,
        },
      })
      completion.completed = true
      refreshAnalyticsCompletionRef.current = null
    }
    setIsLoading(false)
  }, [managedSiteAnalyticsType])

  useLayoutEffect(() => {
    currentManagedSiteTypeRef.current = managedSiteType
    editOpenGenerationRef.current += 1
    channelFilterResourceScopeBaseUrlRef.current = ""
    setChannels([])
    setError(null)
    setHasCompletedInitialChannelLoad(false)
  }, [managedSiteType])

  useEffect(() => {
    void refreshChannels()
    return () => {
      if (activeRefreshRef.current) {
        activeRefreshRef.current.abortSource = REFRESH_ABORT_SOURCES.Cleanup
        activeRefreshRef.current.controller.abort()
      }
    }
  }, [managedSiteType, refreshChannels])

  // 当站点类型变化时，更新分组、优先级、权重列的可见性
  useEffect(() => {
    setColumnVisibility((prev) => ({
      ...prev,
      group: !isOctopus && !isAxonHub,
      priority: !isOctopus && !isAxonHub,
      weight: !isOctopus && !isAxonHub,
    }))
  }, [isAxonHub, isOctopus])

  useEffect(() => {
    deleteScopeGenerationRef.current += 1
    setColumnFilters([])
    setRowSelection({})
    bulkDeleteController.invalidate()
    setPendingDeleteTargets([])
    setDeleteResults([])
    setDeleteRequiresRefresh(false)
    setIsDeleting(false)
    setIsDeleteDialogOpen(false)
    setFilterDialogChannel(null)
    setIsFilterDialogOpen(false)
    setMigrationChannels([])
    setIsMigrationDialogOpen(false)
    setIsMigrationMode(false)
    return () => {
      deleteScopeGenerationRef.current += 1
      bulkDeleteController.invalidate()
    }
  }, [bulkDeleteController, managedSiteType])

  useEffect(() => {
    if (refreshKey) {
      void refreshChannels()
    }
  }, [refreshChannels, refreshKey])

  const attachMutationChannelResourceRef = useCallback(
    (channel: ChannelRow) =>
      attachChannelFilterResourceRefs({
        channels: [channel],
        managedSiteType,
        baseUrl: channelFilterResourceScopeBaseUrlRef.current,
      })[0] ?? channel,
    [managedSiteType],
  )

  const handleOpenCreateDialog = useCallback(() => {
    editOpenGenerationRef.current += 1
    openWithCustom({
      mode: undefined,
      onMutationOutcome: (outcome) => {
        void trackProductAnalyticsActionCompleted({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateManagedSiteChannel,
          surfaceId: channelsToolbarSurface,
          entrypoint: optionsEntrypoint,
          result:
            outcome.result === "success"
              ? PRODUCT_ANALYTICS_RESULTS.Success
              : PRODUCT_ANALYTICS_RESULTS.Failure,
          errorCategory:
            outcome.result === "failure"
              ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
              : undefined,
          insights: {
            managedSiteType:
              resolveProductAnalyticsManagedSiteType(outcome.siteType) ??
              managedSiteAnalyticsType,
          },
        })
      },
      onSuccess: (response) => {
        toast.success(t("toasts.channelSaved"))
        if (isChannelRowLike(response?.data)) {
          const channel = attachMutationChannelResourceRef(response.data)
          setChannels((prev) => upsertChannelRow(prev, channel))
        } else {
          void refreshChannels()
        }
      },
    })
  }, [
    attachMutationChannelResourceRef,
    managedSiteAnalyticsType,
    openWithCustom,
    refreshChannels,
    t,
  ])

  const openChannelDialogForMode = useCallback(
    (channel: ChannelRow, mode: DialogMode) => {
      const openGeneration = ++editOpenGenerationRef.current
      const groups =
        channel.group?.split(",").map((value) => value.trim()) ?? []
      const models =
        channel.models?.split(",").map((value) => value.trim()) ?? []
      const resourceResolution =
        mode === DIALOG_MODES.EDIT
          ? resolveManagedUpstreamResourceCapabilities(managedSiteType)
          : null
      const shouldOfferRealKeyLoading =
        needsManagedSiteChannelKeyResolution(channel.key) &&
        (isNewApiManagedSite || supportsDetailBackedRealKeyLoading)

      const dialogOptions: Parameters<typeof openWithCustom>[0] = {
        mode,
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
        onRequestRealKey: shouldOfferRealKeyLoading
          ? ({ setKey }) => {
              const loadRealKey = async () => {
                try {
                  if (isNewApiManagedSite) {
                    await loadNewApiChannelKeyWithVerification({
                      channelId: channel.id,
                      command:
                        PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
                      label: channel.name,
                      config: {
                        baseUrl: newApiBaseUrl,
                        userId: newApiUserId,
                        username: newApiUsername,
                        password: newApiPassword,
                        totpSecret: newApiTotpSecret,
                      },
                      setKey,
                      openVerification: openNewApiManagedVerification,
                    })
                    return
                  }

                  const service = await getManagedSiteService()
                  const config = await service.getConfig()
                  if (!config) {
                    throw new Error(
                      getManagedSiteConfigMissingMessage(
                        t,
                        service.messagesKey,
                      ),
                    )
                  }

                  if (
                    resourceResolution?.supported &&
                    resourceResolution.capabilities.secrets?.revealSecret
                  ) {
                    const resourceRef = createManagedUpstreamResourceRef({
                      managedSiteType,
                      scopeKey: normalizeManagedUpstreamResourceScopeKey(
                        String((config as { baseUrl?: string }).baseUrl ?? ""),
                      ),
                      resourceId: getManagedUpstreamResourceId(
                        managedSiteType,
                        channel,
                      ),
                    })
                    const result =
                      await resourceResolution.capabilities.secrets.revealSecret(
                        config,
                        resourceRef,
                      )
                    if (result.status === "available") {
                      setKey(result.secret)
                      return
                    }

                    const revealFailureMessage =
                      result.message ??
                      (result.status === "masked"
                        ? t("managedSiteChannels:toasts.revealKeyMasked")
                        : result.status === "unsupported"
                          ? t("managedSiteChannels:toasts.revealKeyUnsupported")
                          : t(
                              "managedSiteChannels:toasts.revealKeyUnavailable",
                            ))
                    throw new Error(revealFailureMessage)
                  }

                  if (!service.fetchChannelSecretKey) {
                    throw new Error(
                      t("managedSiteChannels:toasts.revealKeyUnsupported"),
                    )
                  }

                  const resolvedKey = await service.fetchChannelSecretKey(
                    config,
                    channel.id,
                  )

                  setKey(resolvedKey)
                } catch (error) {
                  toast.error(
                    t("managedSiteChannels:toasts.revealKeyFailed", {
                      error: getErrorMessage(error),
                    }),
                  )
                }
              }

              return loadRealKey()
            }
          : undefined,
        onSuccess:
          mode === DIALOG_MODES.EDIT
            ? (response) => {
                toast.success(t("toasts.channelUpdated"))
                if (isChannelRowLike(response?.data)) {
                  const updatedChannel = attachMutationChannelResourceRef(
                    response.data,
                  )
                  setChannels((prev) => upsertChannelRow(prev, updatedChannel))
                } else {
                  void refreshChannels()
                }
              }
            : undefined,
        onMutationOutcome:
          mode === DIALOG_MODES.EDIT
            ? (outcome) => {
                void trackProductAnalyticsActionCompleted({
                  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
                  actionId:
                    PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
                  surfaceId: channelsRowActionsSurface,
                  entrypoint: optionsEntrypoint,
                  result:
                    outcome.result === "success"
                      ? PRODUCT_ANALYTICS_RESULTS.Success
                      : PRODUCT_ANALYTICS_RESULTS.Failure,
                  errorCategory:
                    outcome.result === "failure"
                      ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
                      : undefined,
                  insights: {
                    managedSiteType:
                      resolveProductAnalyticsManagedSiteType(
                        outcome.siteType,
                      ) ?? managedSiteAnalyticsType,
                  },
                })
              }
            : undefined,
      }

      if (resourceResolution?.supported) {
        void (async () => {
          try {
            const service = await getManagedSiteService()
            const config = await service.getConfig()
            if (!config) {
              throw new Error(
                getManagedSiteConfigMissingMessage(t, service.messagesKey),
              )
            }
            if (editOpenGenerationRef.current !== openGeneration) {
              return
            }

            await openWithCustom({
              ...dialogOptions,
              resourceEdit: {
                config,
                ref: createManagedUpstreamResourceRef({
                  managedSiteType,
                  scopeKey: normalizeManagedUpstreamResourceScopeKey(
                    String((config as { baseUrl?: string }).baseUrl ?? ""),
                  ),
                  resourceId: getManagedUpstreamResourceId(
                    managedSiteType,
                    channel,
                  ),
                }),
                capabilities: resourceResolution.capabilities,
              },
            })
          } catch (error) {
            if (editOpenGenerationRef.current === openGeneration) {
              toast.error(getErrorMessage(error))
            }
          }
        })()
        return
      }

      void openWithCustom(dialogOptions)
    },
    [
      attachMutationChannelResourceRef,
      isNewApiManagedSite,
      managedSiteType,
      managedSiteAnalyticsType,
      newApiBaseUrl,
      newApiPassword,
      newApiTotpSecret,
      newApiUserId,
      newApiUsername,
      openWithCustom,
      refreshChannels,
      supportsDetailBackedRealKeyLoading,
      t,
      openNewApiManagedVerification,
    ],
  )

  const handleOpenEditDialog = useCallback(
    (channel: ChannelRow) => {
      openChannelDialogForMode(channel, DIALOG_MODES.EDIT)
    },
    [openChannelDialogForMode],
  )

  const handleOpenViewDialog = useCallback(
    (channel: ChannelRow) => {
      openChannelDialogForMode(channel, DIALOG_MODES.VIEW)
    },
    [openChannelDialogForMode],
  )

  const scheduleDelete = useCallback(
    (
      targets: LegacyManagedResourceDeleteTarget[],
      analyticsContext: ProductAnalyticsActionContext,
    ) => {
      if (!bulkDeleteController.schedule(targets)) return
      setPendingDeleteTargets(bulkDeleteController.getPendingTargets())
      setDeleteResults([])
      setPendingDeleteAnalyticsContext(analyticsContext)
      setIsDeleteDialogOpen(true)
    },
    [bulkDeleteController],
  )

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteTargets.length || deleteRequiresRefresh) return
    const selectedCount = pendingDeleteTargets.length
    const tracker = pendingDeleteAnalyticsContext
      ? startProductAnalyticsAction(pendingDeleteAnalyticsContext)
      : null
    const deleteScopeGeneration = deleteScopeGenerationRef.current
    const isCurrentDeleteScope = () =>
      deleteScopeGenerationRef.current === deleteScopeGeneration
    let shouldFinalizeDelete = false
    const deleteFailureDisclosure = {
      secretCollection: null as ReturnType<
        typeof collectManagedResourceSecrets
      > | null,
      thrownFailures: [] as unknown[],
    }
    setIsDeleting(true)
    try {
      const execution = await bulkDeleteController.execute({
        resolveDelete: async () => {
          const service = await getManagedSiteService()
          const config = await service.getConfig()
          if (!config) {
            throw new Error(
              getManagedSiteConfigMissingMessage(t, service.messagesKey),
            )
          }

          const secretCollection = collectManagedResourceSecrets(config)
          deleteFailureDisclosure.secretCollection = secretCollection

          return {
            deleteTarget: async (target: LegacyManagedResourceDeleteTarget) => {
              try {
                return await service.deleteChannel(config, target.channelId)
              } catch (error) {
                deleteFailureDisclosure.thrownFailures.push(error)
                throw error
              }
            },
            confirmMissing: async (target: LegacyManagedResourceDeleteTarget) =>
              !(await service.listChannels(config)).items.some(
                (channel) => channel.id === target.channelId,
              ),
            knownSecrets: secretCollection.knownSecrets,
            knownSecretsComplete: secretCollection.complete,
          }
        },
        refresh: () => refreshChannels(),
      })
      if (!execution || !isCurrentDeleteScope()) return
      shouldFinalizeDelete = true

      setDeleteResults(execution.results)
      setDeleteRequiresRefresh(execution.requiresRefresh)

      const successfulOutcomes = execution.outcomes.filter(
        (outcome) => outcome.result.status === "success",
      )
      const failedOutcomes = execution.outcomes.filter(
        (outcome) => outcome.result.status !== "success",
      )
      const successIds = successfulOutcomes.map(
        (outcome) => outcome.target.channelId,
      )

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

      if (failedOutcomes.length > 0) {
        const firstError =
          failedOutcomes.find((outcome) => outcome.reason)?.reason ??
          execution.failure
        toast.error(
          failedOutcomes.length === 1
            ? getErrorMessage(firstError)
            : t("toasts.someDeletesFailed", {
                count: failedOutcomes.length,
                error: getErrorMessage(firstError),
              }),
        )
        tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: selectedCount,
            selectedCount,
            successCount: successIds.length,
            failureCount: failedOutcomes.length,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
      } else {
        tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: selectedCount,
            selectedCount,
            successCount: successIds.length,
            failureCount: 0,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
      }
    } catch (err) {
      if (!isCurrentDeleteScope()) return
      shouldFinalizeDelete = true
      setDeleteRequiresRefresh(bulkDeleteController.requiresRefresh())
      const privateMessage =
        deleteFailureDisclosure.secretCollection?.complete &&
        deleteFailureDisclosure.thrownFailures.some((failure) =>
          Object.is(failure, err),
        )
          ? toPrivateManagedSiteThrownErrorMessage(err, {
              knownSecrets:
                deleteFailureDisclosure.secretCollection.knownSecrets,
            })
          : undefined
      toast.error(
        privateMessage || LEGACY_MANAGED_RESOURCE_DELETE_FAILED_FALLBACK,
      )
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: selectedCount,
          selectedCount,
          managedSiteType: managedSiteAnalyticsType,
        },
      })
    } finally {
      if (shouldFinalizeDelete && isCurrentDeleteScope()) {
        setIsDeleting(false)
        setIsDeleteDialogOpen(false)
        setPendingDeleteTargets([])
        setPendingDeleteAnalyticsContext(null)
      }
    }
  }, [
    bulkDeleteController,
    deleteRequiresRefresh,
    managedSiteAnalyticsType,
    pendingDeleteAnalyticsContext,
    pendingDeleteTargets,
    refreshChannels,
    t,
  ])

  const handleSyncChannels = useCallback(
    async (
      channelIds: number[],
      analyticsContext: ProductAnalyticsActionContext,
    ) => {
      const tracker = startProductAnalyticsAction(analyticsContext)
      const eligibleChannelIds = channelIds.filter((id) => id > 0)

      if (!eligibleChannelIds.length) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          insights: {
            itemCount: 0,
            selectedCount: channelIds.length,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
        return
      }
      setSyncingIds((prev) => {
        const next = new Set(prev)
        eligibleChannelIds.forEach((id) => next.add(id))
        return next
      })
      try {
        const response = await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
          PROTECTION_BYPASS_SURFACES.Options,
          async (protectionBypassExecution) =>
            await sendModelSyncMessage(ModelSyncMessageTypes.TriggerSelected, {
              channelIds: eligibleChannelIds,
              protectionBypassExecution,
            }),
        )
        if (!response?.success) {
          throw new Error(response?.error || "Failed to sync channels")
        }
        const successCount =
          response.data?.statistics?.successCount ?? eligibleChannelIds.length
        const failureCount =
          response.data?.statistics?.failureCount ??
          Math.max(eligibleChannelIds.length - successCount, 0)
        toast.success(
          t("toasts.syncCompleted", {
            success: successCount,
            total: eligibleChannelIds.length,
          }),
        )
        const successfulItems = (response.data?.items ?? []).filter(
          (item: ExecutionItemResult) => item.ok,
        )
        if (successfulItems.length > 0) {
          const modelsByChannelId = new Map<number, string>(
            successfulItems
              .filter((item: ExecutionItemResult) => item.newModels)
              .map((item: ExecutionItemResult) => [
                item.channelId,
                item.newModels!.join(","),
              ]),
          )

          if (modelsByChannelId.size > 0) {
            setChannels((prev) =>
              prev.map((channel) => {
                const nextModels = modelsByChannelId.get(channel.id)
                return nextModels == null
                  ? channel
                  : { ...channel, models: nextModels }
              }),
            )
          }
        }
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: eligibleChannelIds.length,
            selectedCount: channelIds.length,
            successCount,
            failureCount,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
      } catch (err) {
        toast.error(t("toasts.syncFailed", { error: getErrorMessage(err) }))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: eligibleChannelIds.length,
            selectedCount: channelIds.length,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev)
          eligibleChannelIds.forEach((id) => next.delete(id))
          return next
        })
      }
    },
    [managedSiteAnalyticsType, t],
  )

  const rowActionLabels = useMemo<RowActionsLabels>(
    () => ({
      trigger: t("table.columns.actions"),
      edit: t("table.rowActions.edit"),
      view: t("table.rowActions.view"),
      migrate: t("table.rowActions.migrate"),
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

  const openMigrationDialog = useCallback(
    (nextChannels: ChannelRow[]) => {
      if (!nextChannels.length || !hasMigrationTargets) {
        return
      }

      setMigrationChannels(nextChannels)
      setIsMigrationDialogOpen(true)
    },
    [hasMigrationTargets],
  )

  const handleToggleMigrationMode = useCallback(() => {
    if (!hasMigrationTargets && !isMigrationMode) {
      toast.error(
        t("managedSiteChannels:migration.alerts.noTargets.description"),
      )
      return
    }

    setIsMigrationMode((prev) => !prev)
  }, [hasMigrationTargets, isMigrationMode, t])

  const handleCloseMigrationDialog = useCallback(() => {
    setIsMigrationDialogOpen(false)
    setMigrationChannels([])
  }, [])

  const handleOpenSingleChannelMigration = useCallback(
    (channel: ChannelRow) => {
      openMigrationDialog([channel])
    },
    [openMigrationDialog],
  )

  const resolveNewApiMigrationSourceKey = useCallback(
    async ({
      channelId,
      channelName,
    }: {
      channelId: number
      channelName: string
    }) => {
      let resolvedKey = ""

      const loaded = await loadNewApiChannelKeyWithVerification({
        channelId,
        command: PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
        label: channelName,
        requestKind: "channel",
        config: {
          baseUrl: newApiBaseUrl,
          userId: newApiUserId,
          username: newApiUsername,
          password: newApiPassword,
          totpSecret: newApiTotpSecret,
        },
        setKey: (key) => {
          resolvedKey = key
        },
        openVerification: openNewApiManagedVerification,
      })

      if (loaded && resolvedKey.trim()) {
        return resolvedKey.trim()
      }

      throw new Error(
        t(
          "managedSiteChannels:migration.blockedReasons.sourceKeyResolutionFailed",
        ),
      )
    },
    [
      newApiBaseUrl,
      newApiPassword,
      newApiTotpSecret,
      newApiUserId,
      newApiUsername,
      openNewApiManagedVerification,
      t,
    ],
  )

  const setControlledFilter = useCallback(
    (id: "id" | "name" | "status", value: string | string[] | undefined) => {
      setColumnFilters((current) => {
        const next = current.filter((filter) => filter.id !== id)
        if (
          value === undefined ||
          value === "" ||
          (Array.isArray(value) && value.length === 0)
        ) {
          return next
        }
        return [...next, { id, value }]
      })
    },
    [],
  )

  const searchValue =
    (columnFilters.find((filter) => filter.id === "name")?.value as string) ??
    ""
  const channelIdFilterValue =
    (columnFilters.find((filter) => filter.id === "id")?.value as string) ?? ""
  const selectedStatuses = useMemo(
    () =>
      (columnFilters.find((filter) => filter.id === "status")?.value as
        | string[]
        | undefined) ?? [],
    [columnFilters],
  )

  useEffect(() => {
    const channelIdParam = routeParams?.channelId?.trim()
    if (channelIdParam) {
      setControlledFilter("id", channelIdParam)
      setControlledFilter("name", channelIdParam)
      setPagination((current) => ({ ...current, pageIndex: 0 }))
      return
    }

    setControlledFilter("id", undefined)
    setControlledFilter("name", routeParams?.search?.trim() || undefined)
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [routeParams?.channelId, routeParams?.search, setControlledFilter])

  const managedSiteChannelsHash = `#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`
  const handleSearchChange = useCallback(
    (value: string) => {
      setControlledFilter("name", value || undefined)
      setControlledFilter("id", undefined)
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    },
    [setControlledFilter],
  )
  const handleReplaceRouteQuery = useCallback(
    (query: Record<string, string | undefined>) => {
      const nextQuery = normalizeRouteQuery(query)
      const currentQuery = normalizeRouteQuery(routeParams ?? {})
      if (areRouteQueriesEqual(nextQuery, currentQuery)) return
      if (onReplaceRouteQuery) {
        onReplaceRouteQuery(nextQuery)
        return
      }
      navigateWithinOptionsPage(managedSiteChannelsHash, nextQuery)
    },
    [managedSiteChannelsHash, onReplaceRouteQuery, routeParams],
  )

  const channelRowsByKey = useMemo(
    () => new Map(channels.map((channel) => [String(channel.id), channel])),
    [channels],
  )
  const resolveRows = useCallback(
    (rowKeys: string[]) =>
      rowKeys
        .map((rowKey) => channelRowsByKey.get(rowKey))
        .filter((channel): channel is ChannelRow => Boolean(channel)),
    [channelRowsByKey],
  )

  const typeNames = useMemo(
    () =>
      (isOctopus
        ? OctopusOutboundTypeNames
        : isAxonHub
          ? AxonHubChannelTypeNames
          : isClaudeCodeHub
            ? ClaudeCodeHubProviderTypeNames
            : ChannelTypeNames) as Record<string | number, string>,
    [isAxonHub, isClaudeCodeHub, isOctopus],
  )

  const presentationRows = useMemo<ManagedChannelsRowViewModel[]>(
    () =>
      channels.map((channel) => {
        const groups = channel.group?.split(",").filter(Boolean) ?? []
        const modelCount =
          channel.models?.split(",").filter(Boolean).length ?? 0
        const rawType = channel.type
        const typeLabel =
          typeNames[rawType] ?? String(rawType ?? t("statusLabels.unknown"))
        const statusValue = String(channel.status ?? 0)
        const statusTone =
          channel.status === 1
            ? "success"
            : channel.status === 2
              ? "warning"
              : channel.status === 3
                ? "danger"
                : "default"

        return {
          rowKey: String(channel.id),
          testToken: channel.name,
          displayIdentifier: String(channel.id),
          displayIdentifierSort: channel.id,
          name: channel.name,
          baseURL: channel.base_url,
          searchText: `${channel.id} ${channel.name} ${channel.base_url} ${groups.join(" ")}`,
          cells: {
            type: {
              kind: "text",
              value: typeLabel,
              sortValue: String(rawType ?? ""),
              missing: rawType === undefined || rawType === null,
            },
            models: {
              kind: "text",
              value: String(modelCount),
              sortValue: modelCount,
            },
            group: {
              kind: "groups",
              values: groups,
              sortValue: groups.join(","),
              missing: groups.length === 0,
            },
            status: {
              kind: "status",
              value: getManagedSiteChannelStatusFilterLabel(t, statusValue),
              sortValue: statusValue,
              tone: statusTone,
            },
            priority: {
              kind: "text",
              value: String(channel.priority ?? ""),
              sortValue: channel.priority ?? 0,
              missing:
                channel.priority === undefined || channel.priority === null,
            },
            weight: {
              kind: "text",
              value: String(channel.weight ?? ""),
              sortValue: channel.weight ?? 0,
              missing: channel.weight === undefined || channel.weight === null,
            },
          },
          capabilities: {
            canEdit: true,
            canView: true,
            canDelete: true,
            canMigrate: hasMigrationTargets,
            canSync: supportsNewApiOnlyChannelActions,
            canOpenSync: supportsNewApiOnlyChannelActions,
            canFilter: supportsNewApiOnlyChannelActions,
          },
          isSyncing: syncingIds.has(channel.id),
        }
      }),
    [
      channels,
      hasMigrationTargets,
      supportsNewApiOnlyChannelActions,
      syncingIds,
      t,
      typeNames,
    ],
  )

  const filteredPresentationRows = useMemo(
    () =>
      presentationRows.filter((row) => {
        if (
          channelIdFilterValue.trim() &&
          row.displayIdentifier !== channelIdFilterValue.trim()
        ) {
          return false
        }
        if (
          selectedStatuses.length &&
          !selectedStatuses.includes(String(row.cells.status.sortValue))
        ) {
          return false
        }
        const term = searchValue.toLowerCase().trim()
        if (!term) return true
        const groups =
          row.cells.group.kind === "groups"
            ? row.cells.group.values.join(" ")
            : row.cells.group.value
        return `${row.displayIdentifier} ${row.name} ${row.baseURL} ${groups}`
          .toLowerCase()
          .includes(term)
      }),
    [channelIdFilterValue, presentationRows, searchValue, selectedStatuses],
  )

  const columnLabels = useMemo(
    () => ({
      id: t("table.columns.id"),
      name: t("table.columns.name"),
      type: t("table.columns.type"),
      models: t("table.columns.models"),
      group: t("table.columns.group"),
      status: t("table.columns.status"),
      priority: t("table.columns.priority"),
      weight: t("table.columns.weight"),
    }),
    [t],
  )

  const presentationColumns = useMemo<ManagedChannelsColumn[]>(
    () => [
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
        label: columnLabels.id,
        renderer: "identifier",
        accessor: { kind: "displayIdentifier" },
        canHide: true,
        defaultVisible: true,
        visible: columnVisibility.id !== false,
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
        label: columnLabels.name,
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
      ...(["type", "models", "group"] as const).map((id) => ({
        id,
        label: columnLabels[id],
        renderer: "value" as const,
        accessor: { kind: "cell" as const, key: id },
        canHide: true,
        defaultVisible: true,
        visible: columnVisibility[id] !== false,
        sort: {
          accessor: { kind: "cellSortValue" as const, key: id },
          defaultDirection: "asc" as const,
          missing: "last" as const,
        },
        size: 90,
        cellClassName: id === "models" ? "text-sm font-medium" : undefined,
        extension: { kind: "legacy-common" as const },
      })),
      {
        id: "status",
        label: columnLabels.status,
        renderer: "value",
        accessor: { kind: "cell", key: "status" },
        canHide: true,
        defaultVisible: true,
        visible: columnVisibility.status !== false,
        sort: {
          accessor: { kind: "cellSortValue", key: "status" },
          defaultDirection: "asc",
          missing: "last",
        },
        facet: { kind: "status" },
        size: 90,
        extension: { kind: "legacy-common" },
      },
      ...(["priority", "weight"] as const).map((id) => ({
        id,
        label: columnLabels[id],
        renderer: "value" as const,
        accessor: { kind: "cell" as const, key: id },
        canHide: true,
        defaultVisible: true,
        visible: columnVisibility[id] !== false,
        sort: {
          accessor: { kind: "cellSortValue" as const, key: id },
          defaultDirection: "asc" as const,
          missing: "last" as const,
        },
        size: 60,
        extension: { kind: "legacy-common" as const },
      })),
      {
        id: "actions",
        label: t("table.columns.actions"),
        renderer: "actions",
        canHide: false,
        defaultVisible: true,
        visible: true,
        size: 60,
        extension: { kind: "legacy-common" },
      },
    ],
    [columnLabels, columnVisibility, t],
  )

  const presentationLabels = useMemo<ManagedChannelsLabels>(
    () => ({
      searchPlaceholder: t("toolbar.searchPlaceholder"),
      clearSearch: t("toolbar.clearSearch"),
      refresh: t("toolbar.refresh"),
      cancelRefresh: t("toolbar.cancelRefresh"),
      status: t("toolbar.status"),
      statusLabel: t("filter.statusLabel"),
      columns: t("toolbar.columns"),
      toggleColumns: t("toolbar.toggleColumns"),
      migrateSelected: t("toolbar.migrateSelected"),
      migrateFiltered: t("toolbar.migrateFiltered"),
      deleteSelected: t("toolbar.deleteSelected"),
      syncSelected: t("toolbar.syncSelected"),
      addChannel: t("toolbar.addChannel"),
      loading: t("table.loading"),
      emptyFiltered: t("table.emptyFiltered"),
      emptyNoChannels: t("table.emptyNoChannels"),
      rowsPerPage: t("table.rowsPerPage"),
      paginationSummary: t("table.paginationSummary", {
        start: filteredPresentationRows.length
          ? pagination.pageIndex * pagination.pageSize + 1
          : 0,
        end: Math.min(
          (pagination.pageIndex + 1) * pagination.pageSize,
          filteredPresentationRows.length,
        ),
        total: filteredPresentationRows.length,
      }),
      noEntries: t("table.noEntries"),
      paginationPrev: t("table.paginationPrev"),
      paginationNext: t("table.paginationNext"),
      selectAll: t("table.selectAll"),
      selectRow: t("table.selectRow"),
      statusLabels: Object.fromEntries(
        ["0", "1", "2", "3"].map((value) => [
          value,
          getManagedSiteChannelStatusFilterLabel(t, value),
        ]),
      ),
      settings: t("common:labels.settings"),
      configurationRequired: t("common:status.configurationRequired"),
      goToSettings: t("common:actions.goToSettings"),
      deleteTitle: t("dialog.deleteTitle"),
      deleteTitlePlural: t("dialog.deleteTitlePlural"),
      deleteDescription: t("dialog.deleteDescription"),
      deleteCancel: t("dialog.cancel"),
      deleteConfirm: t("dialog.confirm"),
      deleting: t("common:status.deleting"),
      deleteResultsTitle: t("dialog.deleteResultsTitle"),
      deleteRefreshRequired: t("dialog.deleteRefreshRequired"),
      deleteRefreshAction: t("dialog.deleteRefreshAction"),
      deleteResultStatusLabels: {
        success: t("dialog.deleteResultStatus.success"),
        failed: t("dialog.deleteResultStatus.failed"),
        uncertain: t("dialog.deleteResultStatus.uncertain"),
      },
      migrationBeta: t("migration.betaBadge"),
      enterMigrationMode: t("toolbar.enterMigrationMode"),
      exitMigrationMode: t("toolbar.exitMigrationMode"),
      rowActions: rowActionLabels,
    }),
    [
      filteredPresentationRows.length,
      pagination.pageIndex,
      pagination.pageSize,
      rowActionLabels,
      t,
    ],
  )

  const presentationState = useMemo<ManagedChannelsPresentationState>(
    () => ({
      rows: presentationRows,
      routeQuery: normalizeRouteQuery(routeParams ?? {}),
      siteTypeValue: managedSiteType,
      siteTypeOptions: MANAGED_SITE_TYPE_OPTIONS.map((siteType) => ({
        value: siteType,
        label: getManagedSiteLabel(t, siteType),
      })),
      selectedRowKeys: rowSelection,
      sorting,
      searchValue,
      channelIdFilterValue,
      statusFilterValues: selectedStatuses,
      pagination,
      total: filteredPresentationRows.length,
      isLoading,
      isRefreshing: isLoading,
      failure: error
        ? {
            category: t("alerts.loadError.title"),
            message: t("alerts.loadError.description", { error }),
          }
        : null,
      isConfigurationMissing: isConfigMissing,
      migrationMode: isMigrationMode,
      columns: presentationColumns,
      deleteState: {
        isOpen: isDeleteDialogOpen,
        isWorking: isDeleting,
        rowKeys: pendingDeleteTargets.map((target) => target.rowKey),
        results: deleteResults,
        requiresRefresh: deleteRequiresRefresh,
      },
    }),
    [
      channelIdFilterValue,
      deleteRequiresRefresh,
      deleteResults,
      error,
      filteredPresentationRows.length,
      isConfigMissing,
      isDeleteDialogOpen,
      isDeleting,
      isLoading,
      isMigrationMode,
      managedSiteType,
      pagination,
      pendingDeleteTargets,
      presentationColumns,
      presentationRows,
      rowSelection,
      routeParams,
      searchValue,
      selectedStatuses,
      sorting,
      t,
    ],
  )

  const presentationCapabilities = useMemo<ManagedChannelsCapabilities>(
    () => ({
      canCreate: true,
      canRefresh: true,
      canDeleteSelected: true,
      canSyncSelected: supportsNewApiOnlyChannelActions,
      canToggleMigration:
        supportsChannelMigration && (hasMigrationTargets || isMigrationMode),
      canMigrateSelected: hasMigrationTargets,
      canMigrateFiltered: hasMigrationTargets,
      showNewApiOnlyActions: supportsNewApiOnlyChannelActions,
      hasMigrationTargets,
    }),
    [
      hasMigrationTargets,
      isMigrationMode,
      supportsChannelMigration,
      supportsNewApiOnlyChannelActions,
    ],
  )

  const presentationCallbacks = useMemo<ManagedChannelsCallbacks>(
    () => ({
      onRefresh: () => {
        if (isLoading) {
          cancelRefresh()
          return
        }
        void refreshChannels({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteChannels,
          surfaceId: channelsToolbarSurface,
          entrypoint: optionsEntrypoint,
        })
      },
      onSearchChange: handleSearchChange,
      onReplaceRouteQuery: handleReplaceRouteQuery,
      onSettings: () => {
        void openSettingsTab("managedSite", {
          anchor: "managed-site-selector",
          preserveHistory: true,
        })
      },
      onConfigurationRequired: () => {
        void openSettingsTab("managedSite", { preserveHistory: true })
      },
      onSiteTypeChange: async (value) => {
        const siteType = value as ManagedSiteType
        if (siteType === managedSiteType) return
        const writeResult = await updateManagedSiteType(siteType)
        showUpdateToast(writeResult, t("settings:managedSite.siteTypeLabel"))
      },
      onChannelIdFilterChange: (value) =>
        setControlledFilter("id", value || undefined),
      onStatusFilterChange: (values) => {
        setControlledFilter("status", values.length ? values : undefined)
        setPagination((current) => ({ ...current, pageIndex: 0 }))
      },
      onSortingChange: setSorting,
      onColumnVisibilityChange: (next) =>
        setColumnVisibility((current) => ({ ...current, ...next })),
      onPaginationChange: setPagination,
      onSelectedRowKeysChange: setRowSelection,
      onCreate: () => {
        trackManagedSiteChannelToolbarAction(
          PRODUCT_ANALYTICS_ACTION_IDS.CreateManagedSiteChannel,
        )
        handleOpenCreateDialog()
      },
      onToggleMigrationMode: () => {
        trackManagedSiteChannelToolbarAction(
          PRODUCT_ANALYTICS_ACTION_IDS.ToggleManagedSiteChannelMigrationMode,
        )
        handleToggleMigrationMode()
      },
      onMigrateSelected: (rowKeys) => {
        trackManagedSiteChannelToolbarAction(
          PRODUCT_ANALYTICS_ACTION_IDS.OpenSelectedManagedSiteChannelMigration,
        )
        openMigrationDialog(resolveRows(rowKeys))
      },
      onMigrateFiltered: (rowKeys) => {
        trackManagedSiteChannelToolbarAction(
          PRODUCT_ANALYTICS_ACTION_IDS.OpenFilteredManagedSiteChannelMigration,
        )
        openMigrationDialog(resolveRows(rowKeys))
      },
      onEdit: (rowKey) => {
        const channel = channelRowsByKey.get(rowKey)
        if (!channel) return
        handleOpenEditDialog(channel)
        trackManagedSiteChannelRowAction(
          PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
        )
      },
      onView: (rowKey) => {
        const channel = channelRowsByKey.get(rowKey)
        if (!channel) return
        handleOpenViewDialog(channel)
        trackManagedSiteChannelRowAction(
          PRODUCT_ANALYTICS_ACTION_IDS.ViewManagedSiteChannel,
        )
      },
      onMigrate: (rowKey) => {
        const channel = channelRowsByKey.get(rowKey)
        if (!channel) return
        handleOpenSingleChannelMigration(channel)
        trackManagedSiteChannelRowAction(
          PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelMigration,
        )
      },
      onDelete: (rowKey) => {
        const channel = channelRowsByKey.get(rowKey)
        if (!channel) return
        scheduleDelete(
          [
            {
              rowKey,
              channelId: channel.id,
              displayLabel: channel.name,
            },
          ],
          {
            featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
            actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteManagedSiteChannel,
            surfaceId: channelsRowActionsSurface,
            entrypoint: optionsEntrypoint,
          },
        )
      },
      onSync: async (rowKey) => {
        const channel = channelRowsByKey.get(rowKey)
        if (!channel) return
        await handleSyncChannels([channel.id], {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncManagedSiteChannel,
          surfaceId: channelsRowActionsSurface,
          entrypoint: optionsEntrypoint,
        })
      },
      onOpenSync: async (rowKey) => {
        const channel = channelRowsByKey.get(rowKey)
        if (!channel) return
        trackManagedSiteChannelRowAction(
          PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelModelSync,
        )
        await openManagedSiteModelSyncForChannel(channel.id)
      },
      onFilters: (rowKey) => {
        const channel = channelRowsByKey.get(rowKey)
        if (!channel) return
        handleOpenFilterDialog(channel)
        trackManagedSiteChannelRowAction(
          PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelFilters,
        )
      },
      onDeleteSelected: () => {
        const selected = resolveRows(
          Object.keys(rowSelection).filter((rowKey) => rowSelection[rowKey]),
        )
        scheduleDelete(
          selected.map((channel) => ({
            rowKey: String(channel.id),
            channelId: channel.id,
            displayLabel: channel.name,
          })),
          {
            featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.DeleteSelectedManagedSiteChannels,
            surfaceId: channelsToolbarSurface,
            entrypoint: optionsEntrypoint,
          },
        )
      },
      onSyncSelected: async (rowKeys) => {
        await handleSyncChannels(
          resolveRows(rowKeys).map((channel) => channel.id),
          {
            featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteChannels,
            surfaceId: channelsToolbarSurface,
            entrypoint: optionsEntrypoint,
          },
        )
      },
      onDeleteConfirm: () => {
        void handleDelete()
      },
      onDeleteCancel: () => {
        if (isDeleting) return
        bulkDeleteController.cancel()
        setIsDeleteDialogOpen(false)
        setPendingDeleteTargets([])
        setPendingDeleteAnalyticsContext(null)
      },
    }),
    [
      cancelRefresh,
      bulkDeleteController,
      channelRowsByKey,
      handleDelete,
      handleOpenCreateDialog,
      handleOpenEditDialog,
      handleOpenFilterDialog,
      handleOpenSingleChannelMigration,
      handleOpenViewDialog,
      handleSearchChange,
      handleReplaceRouteQuery,
      handleSyncChannels,
      handleToggleMigrationMode,
      isDeleting,
      isLoading,
      managedSiteType,
      openMigrationDialog,
      refreshChannels,
      resolveRows,
      rowSelection,
      scheduleDelete,
      setControlledFilter,
      t,
      updateManagedSiteType,
    ],
  )

  const hasActiveFilters = Boolean(
    searchValue.trim() ||
      channelIdFilterValue.trim() ||
      selectedStatuses.length,
  )
  const isLoadedEmpty =
    hasCompletedInitialChannelLoad &&
    !hasActiveFilters &&
    !error &&
    !isLoading &&
    channels.length === 0
  const shouldPrioritizeApiCredentialProfiles =
    !gatewayGuidanceImportAccountId && hasGatewayGuidanceProfiles
  const gatewayImportActions = !isGatewayGuidanceSourceInventoryLoaded
    ? []
    : shouldPrioritizeApiCredentialProfiles
      ? [
          {
            label: t("gatewayGuidance.empty.importFromApiKeyLibrary"),
            onClick: handleOpenApiCredentialProfiles,
          },
          {
            label: t("gatewayGuidance.empty.importFromAccountKey"),
            onClick: handleOpenGatewayChannelImport,
          },
        ]
      : [
          {
            label: t("gatewayGuidance.empty.importFromAccountKey"),
            onClick: handleOpenGatewayChannelImport,
          },
          {
            label: t("gatewayGuidance.empty.importFromApiKeyLibrary"),
            onClick: handleOpenApiCredentialProfiles,
          },
        ]

  return (
    <>
      <ManagedSiteChannelsView
        state={presentationState}
        capabilities={presentationCapabilities}
        callbacks={presentationCallbacks}
        labels={presentationLabels}
        title={t("title")}
        titleActions={
          !isConfigMissing && managedSiteChannelConsoleUrl ? (
            <Tooltip content={t("gatewayGuidance.openChannelConsole")}>
              <IconButton
                type="button"
                size="sm"
                variant="outline"
                aria-label={t("gatewayGuidance.openChannelConsole")}
                analyticsAction={{
                  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
                  actionId:
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelManagement,
                  surfaceId: channelsToolbarSurface,
                  entrypoint: optionsEntrypoint,
                }}
                onClick={openManagedSiteChannelConsole}
              >
                <WorkflowTransitionIcon className="h-4 w-4" aria-hidden />
              </IconButton>
            </Tooltip>
          ) : null
        }
        description={
          <>
            {t("gatewayGuidance.headerDescription")}{" "}
            {!isConfigMissing && managedSiteTokenConsoleUrl ? (
              <>
                {t("gatewayGuidance.clientHint")}{" "}
                <a
                  href={managedSiteTokenConsoleUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-blue-200"
                >
                  {t("gatewayGuidance.openTokenConsole")}
                </a>
              </>
            ) : null}
          </>
        }
        configurationMissingDescription={getManagedSiteConfigMissingMessage(
          t,
          getManagedSiteMessagesKeyFromSiteType(managedSiteType),
        )}
        configurationMissingNotice={
          <Notice
            tone="info"
            className="mx-auto max-w-md text-left"
            description={t("gatewayGuidance.unconfiguredValueDescription")}
          />
        }
        emptyContent={
          isLoadedEmpty ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-4 text-center">
              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t("gatewayGuidance.empty.title")}
                </div>
                <div className="text-muted-foreground text-sm">
                  {t("gatewayGuidance.empty.description")}
                </div>
              </div>
              <div className="flex w-full max-w-full flex-wrap items-center justify-center gap-2">
                {gatewayImportActions.map((action, index) => (
                  <Button
                    key={action.label}
                    type="button"
                    variant={index === 0 ? "default" : "outline"}
                    size="sm"
                    className="h-auto min-h-8 max-w-full break-words whitespace-normal"
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : undefined
        }
        siteTypeLabel={t("settings:managedSite.siteTypeLabel")}
        filterDialog={
          <ChannelFilterDialog
            channel={filterDialogChannel}
            open={isFilterDialogOpen}
            onClose={handleCloseFilterDialog}
          />
        }
      />

      <ManagedSiteChannelMigrationDialog
        isOpen={isMigrationDialogOpen}
        onClose={handleCloseMigrationDialog}
        onRecoverUncertainResult={async () => {
          return await refreshChannels()
        }}
        channels={migrationChannels}
        preferences={preferences}
        sourceSiteType={managedSiteType}
        availableTargets={migrationTargets}
        resolveNewApiSourceKey={
          isNewApiManagedSite ? resolveNewApiMigrationSourceKey : undefined
        }
      />

      <NewApiManagedVerificationDialog
        isOpen={verification.dialogState.isOpen}
        step={verification.dialogState.step}
        request={verification.dialogState.request}
        code={verification.dialogState.code}
        errorMessage={verification.dialogState.errorMessage}
        isBusy={verification.dialogState.isBusy}
        busyMessage={verification.dialogState.busyMessage}
        onCodeChange={verification.setCode}
        onClose={verification.closeDialog}
        onSubmit={verification.submitCode}
        onRetry={verification.retryVerification}
        onOpenSite={verification.openBaseUrl}
        onUpdateRequestConfig={verification.patchRequestConfig}
      />
    </>
  )
}
