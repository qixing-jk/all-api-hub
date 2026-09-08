import { RefreshCcw, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import ManagedSiteConfigRequiredState from "~/components/ManagedSiteConfigRequiredState"
import ManagedSiteTypeSwitcher from "~/components/ManagedSiteTypeSwitcher"
import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  getManagedResourceRefKey,
  isManagedResourceRefForSite,
  parseManagedResourceRef,
} from "~/services/managedSites/managedResourceIdentity"
import {
  getManagedSiteRuntimeConfigFingerprint,
  hasValidManagedSiteConfig,
  resolveManagedSiteRuntimeConfigForType,
} from "~/services/managedSites/runtimeConfig"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteUnsupportedModelSyncMessage,
  supportsManagedSiteModelSync,
} from "~/services/managedSites/utils/managedSite"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionCompleted,
  type ProductAnalyticsActionCompleteOptions,
  type ProductAnalyticsActionContext,
  type ProductAnalyticsActionInsights,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  type ProductAnalyticsResult,
  type ProductAnalyticsStatusKind,
} from "~/services/productAnalytics/contracts"
import { buildManagedSiteModelSyncDiagnostics } from "~/services/productAnalytics/managedSiteModelSync"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ManagedModelChannelSummary } from "~/types/managedResourceModels"
import type {
  ExecutionHistoryItemResult,
  ExecutionHistoryResult,
  ExecutionItemResult,
  ExecutionProgress,
  ExecutionResult,
} from "~/types/managedSiteModelSync"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import { onRuntimeMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { showWarningToast } from "~/utils/core/toastHelpers"
import { openSettingsTab } from "~/utils/navigation"

import {
  MANAGED_SITE_MODEL_SYNC_ACTIONS,
  type ManagedSiteModelSyncAction,
} from "./actionState"
import ActionBar from "./components/ActionBar"
import EmptyResults from "./components/EmptyResults"
import FilterBar, { type FilterStatus } from "./components/FilterBar"
import LoadingSkeleton from "./components/LoadingSkeleton"
import OverviewCard from "./components/OverviewCard"
import ProgressCard from "./components/ProgressCard"
import ResultsTable from "./components/ResultsTable"
import StatisticsCard from "./components/StatisticsCard"
import {
  getModelSyncHistoryItemKey,
  getModelSyncHistoryResourceId,
} from "./executionIdentity"

/**
 * Unified logger scoped to the Managed Site model sync options dashboard.
 */
const logger = createLogger("ManagedSiteModelSyncPage")
const MODEL_SYNC_PROGRESS_POLL_INTERVAL_MS = 5_000

const TAB_INDEX = {
  history: 0,
  manual: 1,
} as const

const TAB_VALUE = {
  history: "history",
  manual: "manual",
} as const

type ManagedSiteModelSyncTabValue = (typeof TAB_VALUE)[keyof typeof TAB_VALUE]

const getTabValueFromIndex = (index: number): ManagedSiteModelSyncTabValue =>
  index === TAB_INDEX.manual ? TAB_VALUE.manual : TAB_VALUE.history

const hasModelSyncFailures = (execution: ExecutionResult) =>
  execution.statistics.failureCount > 0

const isEmptyModelSyncExecution = (execution: ExecutionResult) =>
  execution.statistics.total === 0 || execution.items.length === 0

const getModelSyncExecutionAnalyticsResult = (execution: ExecutionResult) => {
  if (isEmptyModelSyncExecution(execution)) {
    return PRODUCT_ANALYTICS_RESULTS.Skipped
  }

  if (hasModelSyncFailures(execution)) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }

  return PRODUCT_ANALYTICS_RESULTS.Success
}

const getModelSyncExecutionAnalyticsCompletionOptions = (
  execution: ExecutionResult,
): ProductAnalyticsActionCompleteOptions => ({
  ...(hasModelSyncFailures(execution)
    ? { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }
    : {}),
  insights: {
    itemCount: execution.statistics.total,
    successCount: execution.statistics.successCount,
    failureCount: execution.statistics.failureCount,
  },
})

const getItemCount = (items?: unknown[]) => items?.length ?? 0

const getStatusKindFromFilterStatus = (
  status: FilterStatus,
): ProductAnalyticsStatusKind | undefined =>
  status === "all" ? undefined : status === "success" ? "healthy" : "error"

const filterExecutionItems = (
  items: ExecutionHistoryItemResult[],
  status: FilterStatus,
  keyword: string,
) =>
  items.filter((item) => {
    if (status === "success" && !item.ok) return false
    if (status === "failed" && item.ok) return false

    if (keyword) {
      const normalizedKeyword = keyword.toLowerCase()
      return (
        item.channelName.toLowerCase().includes(normalizedKeyword) ||
        getModelSyncHistoryResourceId(item)
          .toLowerCase()
          .includes(normalizedKeyword) ||
        item.message?.toLowerCase().includes(normalizedKeyword)
      )
    }

    return true
  })

const actionBarAnalyticsScope = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}
const manualPanelAnalyticsScope = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncManualPanel,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}
const resultsTableAnalyticsScope = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncResultsTable,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

const startModelSyncAnalytics = (context: ProductAnalyticsActionContext) =>
  startProductAnalyticsAction(context)

/**
 * New API Model Sync dashboard showing history, manual runs, progress, and filters.
 * Fetches execution data, channels, and renders tabs for history and manual sync.
 * @returns Page layout with controls, status, and result tables.
 */
interface ManagedSiteModelSyncProps {
  refreshKey?: number
  routeParams?: Record<string, string>
}

interface SyncRequestToken {
  generation: number
  requestId: number
}

/**
 * Managed Site Model Sync Page
 */
export default function ManagedSiteModelSync({
  refreshKey,
  routeParams,
}: ManagedSiteModelSyncProps) {
  const { t } = useTranslation([
    "managedSiteModelSync",
    "settings",
    "messages",
    "common",
  ])
  const { managedSiteType, preferences } = useUserPreferencesContext()
  const hasInitializedTab = useRef(false)
  const configMissingTrackedFor = useRef<string | null>(null)
  const historySearchAnalyticsKey = useRef<string | null>(null)
  const manualSearchAnalyticsKey = useRef<string | null>(null)
  const contextGenerationRef = useRef(0)
  const lastExecutionRequestIdRef = useRef(0)
  const channelsRequestIdRef = useRef(0)
  const lastExecutionLoadingRequestIdsRef = useRef<Set<number>>(new Set())
  const nextSyncRequestIdRef = useRef(0)
  const activeSyncRequestRef = useRef<SyncRequestToken | null>(null)
  const isConfigMissing = !hasValidManagedSiteConfig(
    preferences,
    managedSiteType,
  )
  const isModelSyncUnsupported = !supportsManagedSiteModelSync(managedSiteType)
  const selectedTarget = useMemo(
    () => resolveManagedSiteRuntimeConfigForType(preferences, managedSiteType),
    [preferences, managedSiteType],
  )
  const selectedScopeKey = normalizeManagedUpstreamResourceScopeKey(
    selectedTarget?.config.baseUrl ?? "",
  )
  const managedSiteConfigFingerprint = useMemo(
    () => getManagedSiteRuntimeConfigFingerprint(preferences, managedSiteType),
    [managedSiteType, preferences],
  )
  const canUseResource = useCallback(
    (ref: ManagedResourceRef) =>
      Boolean(
        selectedTarget && isManagedResourceRefForSite(ref, selectedTarget),
      ),
    [selectedTarget],
  )
  const routedResourceRef = useMemo(
    () => parseManagedResourceRef(routeParams?.resourceRef),
    [routeParams?.resourceRef],
  )
  const routeResourceUnavailable = Boolean(
    routeParams?.resourceRef &&
      (!routedResourceRef || !canUseResource(routedResourceRef)),
  )
  const [lastExecution, setLastExecution] =
    useState<ExecutionHistoryResult | null>(null)
  const [progress, setProgress] = useState<ExecutionProgress | null>(null)
  const [nextScheduledAt, setNextScheduledAt] = useState<string | null>(null)
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(false)
  const [intervalMs, setIntervalMs] = useState<number | undefined>(undefined)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [historySelectedKeys, setHistorySelectedKeys] = useState<Set<string>>(
    new Set(),
  )
  const [manualSelectedKeys, setManualSelectedKeys] = useState<Set<string>>(
    new Set(),
  )

  const runManualModelSync = async <T,>(
    work: (protectionBypassExecution: ProtectionBypassExecution) => Promise<T>,
  ) => {
    return await withProtectionBypassUserCommand(
      PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
      PROTECTION_BYPASS_SURFACES.Options,
      work,
    )
  }
  const [isLoading, setIsLoading] = useState(true)
  const [isManualRefreshPending, setIsManualRefreshPending] = useState(false)
  const [activeAction, setActiveAction] =
    useState<ManagedSiteModelSyncAction | null>(null)
  const [runningResourceKey, setRunningResourceKey] = useState<string | null>(
    null,
  )
  const [selectedTab, setSelectedTab] = useState<number>(TAB_INDEX.history)
  const [channels, setChannels] = useState<ManagedModelChannelSummary[]>([])
  const [isChannelsLoading, setIsChannelsLoading] = useState(false)
  const [isManualChannelRefresh, setIsManualChannelRefresh] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [manualSearchKeyword, setManualSearchKeyword] = useState("")
  const [hasAttemptedChannelsLoad, setHasAttemptedChannelsLoad] =
    useState(false)

  const tryStartSyncRequest = () => {
    if (activeSyncRequestRef.current || progress?.isRunning) return null

    const token = {
      generation: contextGenerationRef.current,
      requestId: ++nextSyncRequestIdRef.current,
    }
    activeSyncRequestRef.current = token
    return token
  }

  const isCurrentSyncRequest = (token: SyncRequestToken) => {
    const activeToken = activeSyncRequestRef.current
    return (
      token.generation === contextGenerationRef.current &&
      activeToken?.generation === token.generation &&
      activeToken.requestId === token.requestId
    )
  }

  const finishSyncRequest = (token: SyncRequestToken) => {
    if (!isCurrentSyncRequest(token)) return false

    activeSyncRequestRef.current = null
    return true
  }

  const managedSiteAnalyticsInsights = useMemo(
    () => ({
      managedSiteType,
    }),
    [managedSiteType],
  )

  const completeModelSyncActionAnalytics = useCallback(
    (
      tracker: ReturnType<typeof startProductAnalyticsAction>,
      result: ProductAnalyticsResult = PRODUCT_ANALYTICS_RESULTS.Success,
      options: ProductAnalyticsActionCompleteOptions = {},
    ) => {
      tracker.complete(result, {
        ...options,
        insights: {
          ...managedSiteAnalyticsInsights,
          ...options.insights,
        },
      })
    },
    [managedSiteAnalyticsInsights],
  )

  const completeModelSyncExecutionAnalytics = useCallback(
    (
      tracker: ReturnType<typeof startProductAnalyticsAction>,
      execution: ExecutionResult,
      insights?: ProductAnalyticsActionInsights,
    ) => {
      const result = getModelSyncExecutionAnalyticsResult(execution)
      const options = getModelSyncExecutionAnalyticsCompletionOptions(execution)

      completeModelSyncActionAnalytics(tracker, result, {
        ...options,
        diagnostics: buildManagedSiteModelSyncDiagnostics({
          managedSiteType,
          mode: insights?.mode ?? PRODUCT_ANALYTICS_MODE_IDS.All,
          sourceKind: insights?.sourceKind,
          execution,
        }),
        insights: {
          ...options.insights,
          ...insights,
        },
      })
    },
    [completeModelSyncActionAnalytics, managedSiteType],
  )

  const trackInstantModelSyncAction = useCallback(
    (
      context: ProductAnalyticsActionContext,
      insights?: ProductAnalyticsActionInsights,
    ) => {
      const tracker = startModelSyncAnalytics(context)
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights,
        },
      )
    },
    [completeModelSyncActionAnalytics],
  )

  const loadLastExecution = useCallback(async () => {
    const generation = contextGenerationRef.current
    const requestId = ++lastExecutionRequestIdRef.current
    lastExecutionLoadingRequestIdsRef.current.add(requestId)
    try {
      setIsLoading(true)
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.GetLastExecution,
      )

      if (response.success) {
        if (
          generation === contextGenerationRef.current &&
          requestId === lastExecutionRequestIdRef.current
        ) {
          setLastExecution(response.data)
        }
        return getItemCount(response.data?.items)
      }
    } catch (error) {
      logger.error("Failed to load last execution", error)
    } finally {
      if (generation === contextGenerationRef.current) {
        lastExecutionLoadingRequestIdsRef.current.delete(requestId)
        if (lastExecutionLoadingRequestIdsRef.current.size === 0) {
          setIsLoading(false)
        }
      }
    }

    return null
  }, [])

  const loadProgress = useCallback(async () => {
    const generation = contextGenerationRef.current
    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.GetProgress,
      )

      if (
        response.success &&
        generation === contextGenerationRef.current &&
        (!response.data ||
          response.data.configFingerprint === managedSiteConfigFingerprint)
      ) {
        setProgress(response.data)
      }
    } catch (error) {
      logger.error("Failed to load progress", error)
    }
  }, [managedSiteConfigFingerprint])

  const loadNextRun = useCallback(async () => {
    const generation = contextGenerationRef.current
    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.GetNextRun,
      )

      if (response.success && generation === contextGenerationRef.current) {
        setNextScheduledAt(response.data?.nextScheduledAt ?? null)
      }
    } catch (error) {
      logger.error("Failed to load next run", error)
    }
  }, [])

  const loadPreferences = useCallback(async () => {
    const generation = contextGenerationRef.current
    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.GetPreferences,
      )

      if (response.success && generation === contextGenerationRef.current) {
        setIsAutoSyncEnabled(!!response.data?.enableSync)
        setIntervalMs(response.data?.intervalMs)
      }
    } catch (error) {
      logger.error("Failed to load preferences", error)
    }
  }, [])

  const loadChannels = useCallback(async () => {
    const generation = contextGenerationRef.current
    const requestId = ++channelsRequestIdRef.current
    const isCurrent = () =>
      generation === contextGenerationRef.current &&
      requestId === channelsRequestIdRef.current
    const tracker = startModelSyncAnalytics({
      ...manualPanelAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ReloadManagedSiteModelSyncChannels,
    })

    try {
      setIsChannelsLoading(true)
      setChannelsError(null)
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.ListChannels,
      )

      if (!isCurrent()) {
        completeModelSyncActionAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Skipped,
        )
        return null
      }
      if (response.success) {
        const items = response.data?.items ?? []
        setChannels(items)
        completeModelSyncActionAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Success,
          {
            insights: {
              itemCount: items.length,
            },
          },
        )
        return items
      } else {
        throw new Error(response.error)
      }
    } catch (error: any) {
      if (!isCurrent()) {
        completeModelSyncActionAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Skipped,
        )
        return null
      }
      const message = error?.message || "Unknown error"
      setChannelsError(message)
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: 0,
          },
        },
      )
      toast.error(
        t("messages.error.loadFailed", {
          error: message,
        }),
      )
      return null
    } finally {
      if (isCurrent()) {
        setIsChannelsLoading(false)
        setHasAttemptedChannelsLoad(true)
      }
    }
  }, [completeModelSyncActionAnalytics, t])

  const handleManualChannelRefresh = useCallback(async () => {
    if (isChannelsLoading) return

    const generation = contextGenerationRef.current
    setIsManualChannelRefresh(true)
    try {
      await loadChannels()
    } finally {
      if (generation === contextGenerationRef.current) {
        setIsManualChannelRefresh(false)
      }
    }
  }, [isChannelsLoading, loadChannels])

  const handleRefresh = async () => {
    if (isManualRefreshPending) return

    const generation = contextGenerationRef.current
    setIsManualRefreshPending(true)
    try {
      const tracker = startModelSyncAnalytics({
        ...actionBarAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteModelSyncResults,
      })

      const itemCount = await loadLastExecution()
      if (generation === contextGenerationRef.current) {
        await Promise.all([loadProgress(), loadNextRun(), loadPreferences()])
      }

      completeModelSyncActionAnalytics(
        tracker,
        itemCount === null
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
        {
          ...(itemCount === null
            ? { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }
            : {}),
          insights: {
            itemCount: itemCount ?? 0,
          },
        },
      )
    } finally {
      if (generation === contextGenerationRef.current) {
        setIsManualRefreshPending(false)
      }
    }
  }

  useEffect(() => {
    contextGenerationRef.current += 1
    lastExecutionRequestIdRef.current += 1
    channelsRequestIdRef.current += 1
    lastExecutionLoadingRequestIdsRef.current.clear()
    activeSyncRequestRef.current = null
    hasInitializedTab.current = false
    setLastExecution(null)
    setProgress(null)
    setNextScheduledAt(null)
    setIsAutoSyncEnabled(false)
    setIntervalMs(undefined)
    setHistorySelectedKeys(new Set())
    setManualSelectedKeys(new Set())
    setIsManualRefreshPending(false)
    setActiveAction(null)
    setRunningResourceKey(null)
    setChannels([])
    setIsChannelsLoading(false)
    setIsManualChannelRefresh(false)
    setChannelsError(null)
    setHasAttemptedChannelsLoad(false)
    setIsLoading(!isConfigMissing && !isModelSyncUnsupported)
  }, [isConfigMissing, isModelSyncUnsupported, managedSiteConfigFingerprint])

  useEffect(() => {
    if (isModelSyncUnsupported) {
      setIsLoading(false)
      return
    }

    if (isConfigMissing) {
      setIsLoading(false)
      if (configMissingTrackedFor.current !== managedSiteType) {
        configMissingTrackedFor.current = managedSiteType
        void trackProductAnalyticsActionCompleted({
          ...actionBarAnalyticsScope,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteModelSyncConfigRequired,
          result: PRODUCT_ANALYTICS_RESULTS.Skipped,
          insights: {
            managedSiteType,
            targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ConfigRequired,
          },
        })
      }
      return
    }

    configMissingTrackedFor.current = null
    void loadLastExecution()
    void loadProgress()
    void loadNextRun()
    void loadPreferences()

    // Listen for progress updates
    const generation = contextGenerationRef.current
    const handleMessage = (message: any) => {
      if (
        generation === contextGenerationRef.current &&
        message.type === "MANAGED_SITE_MODEL_SYNC_PROGRESS" &&
        message.payload?.configFingerprint === managedSiteConfigFingerprint
      ) {
        setProgress(message.payload)

        // If sync completed, reload execution results
        if (!message.payload?.isRunning) {
          void loadLastExecution()
          void loadNextRun()
        }
      }
    }

    return onRuntimeMessage(handleMessage)
  }, [
    completeModelSyncActionAnalytics,
    isConfigMissing,
    isModelSyncUnsupported,
    loadLastExecution,
    loadNextRun,
    loadPreferences,
    loadProgress,
    managedSiteConfigFingerprint,
    managedSiteType,
  ])

  useEffect(() => {
    if (!progress?.isRunning) {
      return
    }

    const intervalId = setInterval(() => {
      void loadProgress()
    }, MODEL_SYNC_PROGRESS_POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [loadProgress, progress?.isRunning])

  useEffect(() => {
    if (isLoading || hasInitializedTab.current) {
      return
    }

    hasInitializedTab.current = true
    setSelectedTab(
      lastExecution?.items?.length ? TAB_INDEX.history : TAB_INDEX.manual,
    )
  }, [isLoading, lastExecution?.items?.length])

  useEffect(() => {
    if (
      !isConfigMissing &&
      !isModelSyncUnsupported &&
      selectedTab === TAB_INDEX.manual &&
      channels.length === 0 &&
      !isChannelsLoading &&
      !hasAttemptedChannelsLoad
    ) {
      void loadChannels()
    }
  }, [
    channels.length,
    hasAttemptedChannelsLoad,
    isConfigMissing,
    isModelSyncUnsupported,
    isChannelsLoading,
    loadChannels,
    selectedTab,
  ])

  useEffect(() => {
    if (isConfigMissing || isModelSyncUnsupported) {
      return
    }

    if (refreshKey) {
      void loadLastExecution()
      void loadProgress()
      void loadNextRun()
      void loadPreferences()
    }
  }, [
    isConfigMissing,
    isModelSyncUnsupported,
    loadLastExecution,
    loadNextRun,
    loadPreferences,
    loadProgress,
    refreshKey,
  ])

  useEffect(() => {
    if (isConfigMissing || isModelSyncUnsupported) {
      return
    }

    const channelIdRaw = routeParams?.channelId?.trim()
    const selectedRef =
      routedResourceRef &&
      isManagedResourceRefForSite(routedResourceRef, {
        siteType: managedSiteType,
        config: { baseUrl: selectedScopeKey },
      })
        ? routedResourceRef
        : null
    const requestedTab = routeParams?.tab?.trim()

    if (routeParams?.resourceRef || channelIdRaw) {
      hasInitializedTab.current = true
      setSelectedTab(TAB_INDEX.manual)
      setManualSearchKeyword(
        routedResourceRef?.resourceId ?? channelIdRaw ?? "",
      )
      setManualSelectedKeys(
        new Set(selectedRef ? [getManagedResourceRefKey(selectedRef)] : []),
      )
      return
    }

    if (requestedTab === "history" || requestedTab === "manual") {
      hasInitializedTab.current = true
      setSelectedTab(TAB_INDEX[requestedTab])
    }

    const search = routeParams?.search?.trim()
    if (search) {
      setSearchKeyword(search)
      setManualSearchKeyword(search)
    }
  }, [
    isConfigMissing,
    isModelSyncUnsupported,
    managedSiteConfigFingerprint,
    managedSiteType,
    routeParams?.channelId,
    routeParams?.resourceRef,
    routedResourceRef,
    selectedScopeKey,
    routeParams?.search,
    routeParams?.tab,
  ])

  /**
   * Shows a toast notification based on the execution result, highlighting any failures and providing a retry action if needed.
   */
  function notifySyncCompletion(execution: ExecutionResult) {
    if (hasModelSyncFailures(execution)) {
      showWarningToast(
        t("messages.warning.syncCompletedWithFailures", {
          success: execution.statistics.successCount,
          total: execution.statistics.total,
          failed: execution.statistics.failureCount,
        }),
        {
          action: {
            label: t("execution.actions.retryFailed"),
            pendingLabel: t("common:status.retrying"),
            onClick: () =>
              handleRetryFailed(
                execution.items
                  .filter((item) => !item.ok)
                  .map((item) => item.resourceRef),
              ),
          },
        },
      )
      return
    }

    toast.success(
      t("messages.success.syncCompleted", {
        success: execution.statistics.successCount,
        total: execution.statistics.total,
      }),
    )
  }

  const retryableFailedRefs =
    lastExecution?.items.flatMap((item) =>
      !item.ok && item.resourceRef && canUseResource(item.resourceRef)
        ? [item.resourceRef]
        : [],
    ) ?? []

  /** Retries the failed resources captured by the history view or completion toast. */
  async function handleRetryFailed(resourceRefs: ManagedResourceRef[]) {
    if (!resourceRefs.length || !resourceRefs.every(canUseResource)) return
    const requestToken = tryStartSyncRequest()
    if (!requestToken) return

    const tracker = startModelSyncAnalytics({
      ...actionBarAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryFailedManagedSiteModelSync,
    })

    setActiveAction(MANAGED_SITE_MODEL_SYNC_ACTIONS.RETRY_FAILED)
    try {
      const response = await runManualModelSync(
        async (protectionBypassExecution) =>
          await sendModelSyncMessage(ModelSyncMessageTypes.TriggerSelected, {
            resourceRefs,
            protectionBypassExecution,
          }),
      )

      if (!isCurrentSyncRequest(requestToken)) return

      if (response.success) {
        notifySyncCompletion(response.data)
        setLastExecution(response.data)
        completeModelSyncExecutionAnalytics(tracker, response.data, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.RetryFailed,
        })
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
        completeModelSyncActionAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Failure,
          {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          },
        )
      }
    } catch (error: any) {
      if (!isCurrentSyncRequest(requestToken)) return

      toast.error(t("messages.error.syncFailed", { error: error.message }))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    } finally {
      if (finishSyncRequest(requestToken)) {
        setActiveAction(null)
      }
    }
  }

  const handleRunAll = async () => {
    const requestToken = tryStartSyncRequest()
    if (!requestToken) return

    const tracker = startModelSyncAnalytics({
      ...actionBarAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncAllManagedSiteModels,
    })

    setActiveAction(MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_ALL)
    try {
      const latestChannels =
        managedSiteType === SITE_TYPES.NEW_API ? await loadChannels() : channels
      if (!isCurrentSyncRequest(requestToken)) return
      if (!latestChannels) {
        completeModelSyncActionAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Failure,
          {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          },
        )
        return
      }
      const response = await runManualModelSync(
        async (protectionBypassExecution) =>
          await sendModelSyncMessage(ModelSyncMessageTypes.TriggerAll, {
            protectionBypassExecution,
          }),
      )

      if (!isCurrentSyncRequest(requestToken)) return

      if (response.success) {
        notifySyncCompletion(response.data)
        setLastExecution(response.data)
        completeModelSyncExecutionAnalytics(tracker, response.data, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
        })
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
        completeModelSyncActionAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Failure,
          {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          },
        )
      }
    } catch (error: any) {
      if (!isCurrentSyncRequest(requestToken)) return

      toast.error(t("messages.error.syncFailed", { error: error.message }))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    } finally {
      if (finishSyncRequest(requestToken)) {
        setActiveAction(null)
      }
    }
  }

  const handleRunSelected = async (source: "history" | "manual") => {
    const selectedSet =
      source === "history" ? historySelectedKeys : manualSelectedKeys

    const selectableItems =
      source === "history"
        ? lastExecution?.items ?? []
        : channels.map((channel) => ({ resourceRef: channel.ref }))
    const selectedResourceRefs = selectableItems.flatMap((item) =>
      item.resourceRef &&
      canUseResource(item.resourceRef) &&
      selectedSet.has(getManagedResourceRefKey(item.resourceRef))
        ? [item.resourceRef]
        : [],
    )
    const requestToken =
      selectedResourceRefs.length > 0 ? tryStartSyncRequest() : null
    if (selectedResourceRefs.length > 0 && !requestToken) return

    const tracker = startModelSyncAnalytics({
      ...(source === "history"
        ? actionBarAnalyticsScope
        : manualPanelAnalyticsScope),
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
    })

    if (selectedResourceRefs.length === 0) {
      toast.error(t("messages.error.noSelection"))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
            sourceKind:
              source === "history"
                ? PRODUCT_ANALYTICS_SOURCE_KINDS.History
                : PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            selectedCount: 0,
          },
        },
      )
      return
    }

    if (!requestToken) return

    setActiveAction(
      source === "history"
        ? MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_SELECTED_HISTORY
        : MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_SELECTED_MANUAL,
    )
    try {
      const response = await runManualModelSync(
        async (protectionBypassExecution) =>
          await sendModelSyncMessage(ModelSyncMessageTypes.TriggerSelected, {
            resourceRefs: selectedResourceRefs,
            protectionBypassExecution,
          }),
      )

      if (!isCurrentSyncRequest(requestToken)) return

      if (response.success) {
        notifySyncCompletion(response.data)
        setLastExecution(response.data)
        if (source === "history") {
          setHistorySelectedKeys(new Set())
        } else {
          setManualSelectedKeys(new Set())
        }
        completeModelSyncExecutionAnalytics(tracker, response.data, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
          sourceKind:
            source === "history"
              ? PRODUCT_ANALYTICS_SOURCE_KINDS.History
              : PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          selectedCount: selectedResourceRefs.length,
        })
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
        completeModelSyncActionAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Failure,
          {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          },
        )
      }
    } catch (error: any) {
      if (!isCurrentSyncRequest(requestToken)) return

      toast.error(t("messages.error.syncFailed", { error: error.message }))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    } finally {
      if (finishSyncRequest(requestToken)) {
        setActiveAction(null)
      }
    }
  }

  const handleRunSingle = async (resourceRef: ManagedResourceRef) => {
    if (!canUseResource(resourceRef)) return
    const resourceKey = getManagedResourceRefKey(resourceRef)
    const requestToken = tryStartSyncRequest()
    if (!requestToken) return

    const tracker = startModelSyncAnalytics({
      ...resultsTableAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSingleManagedSiteModel,
    })

    setRunningResourceKey(resourceKey)
    try {
      const response = await runManualModelSync(
        async (protectionBypassExecution) =>
          await sendModelSyncMessage(ModelSyncMessageTypes.TriggerSelected, {
            resourceRefs: [resourceRef],
            protectionBypassExecution,
          }),
      )

      if (!isCurrentSyncRequest(requestToken)) return

      if (response.success) {
        const newItem = response.data.items[0]

        if (newItem) {
          if (newItem.ok) {
            toast.success(
              t("messages.success.syncCompleted", {
                success: 1,
                total: 1,
              }),
            )
          } else {
            toast.error(
              t("messages.error.syncFailed", {
                error: newItem.message || "Unknown error",
              }),
            )
          }

          setLastExecution((prev) => {
            if (!prev) {
              return response.data
            }

            const updatedItems = prev.items.map((item) =>
              getModelSyncHistoryItemKey(item) === resourceKey ? newItem : item,
            )

            const successCount = updatedItems.filter((item) => item.ok).length
            const failureCount = updatedItems.length - successCount

            return {
              ...prev,
              items: updatedItems,
              statistics: {
                ...prev.statistics,
                successCount,
                failureCount,
              },
            }
          })
        }
        completeModelSyncExecutionAnalytics(tracker, response.data, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Row,
          selectedCount: 1,
        })
      } else {
        toast.error(t("messages.error.syncFailed", { error: response.error }))
        completeModelSyncActionAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Failure,
          {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          },
        )
      }
    } catch (error: any) {
      if (!isCurrentSyncRequest(requestToken)) return

      toast.error(t("messages.error.syncFailed", { error: error.message }))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    } finally {
      if (finishSyncRequest(requestToken)) {
        setRunningResourceKey(null)
      }
    }
  }

  const handleHistorySelectAll = (checked: boolean) => {
    const itemCount = filteredItems?.length ?? 0
    if (checked && filteredItems) {
      setHistorySelectedKeys(
        new Set(
          filteredItems
            .filter(
              (item) => item.resourceRef && canUseResource(item.resourceRef),
            )
            .map(getModelSyncHistoryItemKey),
        ),
      )
    } else {
      setHistorySelectedKeys(new Set())
    }
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SelectAllManagedSiteModelSyncChannels,
      },
      {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        selectedCount: checked ? itemCount : 0,
        itemCount,
      },
    )
  }

  const handleHistorySelectItem = (resourceKey: string, checked: boolean) => {
    const newSelected = new Set(historySelectedKeys)
    if (checked) {
      newSelected.add(resourceKey)
    } else {
      newSelected.delete(resourceKey)
    }
    setHistorySelectedKeys(newSelected)
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SelectAllManagedSiteModelSyncChannels,
      },
      {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        selectedCount: newSelected.size,
        itemCount: filteredItems?.length ?? 0,
      },
    )
  }

  const filteredItems = lastExecution
    ? filterExecutionItems(lastExecution.items, filterStatus, searchKeyword)
    : undefined

  const manualItems: ExecutionItemResult[] = useMemo(() => {
    const keyword = manualSearchKeyword.toLowerCase().trim()
    const source = keyword
      ? channels.filter(
          (channel) =>
            channel.name.toLowerCase().includes(keyword) ||
            channel.ref.resourceId.toLowerCase().includes(keyword),
        )
      : channels

    return source.map((channel) => ({
      resourceRef: channel.ref,
      channelName: channel.name,
      ok: true,
      attempts: 0,
      finishedAt: 0,
    }))
  }, [channels, manualSearchKeyword])

  const handleTabChange = (index: number) => {
    setSelectedTab(index)
    trackInstantModelSyncAction(
      {
        ...actionBarAnalyticsScope,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectManagedSiteModelSyncTab,
      },
      {
        sourceKind:
          index === TAB_INDEX.manual
            ? PRODUCT_ANALYTICS_SOURCE_KINDS.Manual
            : PRODUCT_ANALYTICS_SOURCE_KINDS.History,
      },
    )
  }

  const handleHistoryStatusChange = (status: FilterStatus) => {
    if (status === filterStatus) {
      return
    }

    const nextItems = lastExecution
      ? filterExecutionItems(lastExecution.items, status, searchKeyword)
      : []
    setFilterStatus(status)
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.FilterManagedSiteModelSyncResults,
      },
      {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        statusKind: getStatusKindFromFilterStatus(status),
        itemCount: nextItems.length,
      },
    )
  }

  const handleHistorySearchChange = (keyword: string) => {
    setSearchKeyword(keyword)
  }

  const handleManualSearchChange = (keyword: string) => {
    setManualSearchKeyword(keyword)
  }

  useEffect(() => {
    const normalizedKeyword = searchKeyword.trim()
    const resultCount = filteredItems?.length ?? 0
    const analyticsKey = normalizedKeyword
      ? `history:${normalizedKeyword}:${resultCount}`
      : "history:empty"

    if (historySearchAnalyticsKey.current === analyticsKey) {
      return
    }

    historySearchAnalyticsKey.current = analyticsKey

    if (!normalizedKeyword) {
      return
    }

    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SearchManagedSiteModelSyncChannels,
      },
      {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        itemCount: resultCount,
      },
    )
  }, [filteredItems?.length, searchKeyword, trackInstantModelSyncAction])

  useEffect(() => {
    const normalizedKeyword = manualSearchKeyword.trim()
    const resultCount = manualItems.length
    const analyticsKey = normalizedKeyword
      ? `manual:${normalizedKeyword}:${resultCount}`
      : "manual:empty"

    if (manualSearchAnalyticsKey.current === analyticsKey) {
      return
    }

    manualSearchAnalyticsKey.current = analyticsKey

    if (!normalizedKeyword) {
      return
    }

    trackInstantModelSyncAction(
      {
        ...manualPanelAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SearchManagedSiteModelSyncChannels,
      },
      {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        itemCount: resultCount,
      },
    )
  }, [manualItems.length, manualSearchKeyword, trackInstantModelSyncAction])

  const isInitialLoading = isLoading && lastExecution === null

  if (!isConfigMissing && isInitialLoading) {
    return <LoadingSkeleton />
  }

  const hasHistory = !!(lastExecution && lastExecution.items.length > 0)
  const hasResults = !!(filteredItems && filteredItems.length > 0)
  const manualHasResults = manualItems.length > 0
  const historyTabLabel = t("execution.tabs.history")
  const manualTabLabel = t("execution.tabs.manual")

  const handleManualSelectAll = (checked: boolean) => {
    const itemCount = manualItems.length
    if (checked) {
      setManualSelectedKeys(
        new Set(manualItems.map(getModelSyncHistoryItemKey)),
      )
    } else {
      setManualSelectedKeys(new Set())
    }
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SelectAllManagedSiteModelSyncChannels,
      },
      {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        selectedCount: checked ? itemCount : 0,
        itemCount,
      },
    )
  }

  const handleManualSelectItem = (resourceKey: string, checked: boolean) => {
    const newSelected = new Set(manualSelectedKeys)
    if (checked) {
      newSelected.add(resourceKey)
    } else {
      newSelected.delete(resourceKey)
    }
    setManualSelectedKeys(newSelected)
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SelectAllManagedSiteModelSyncChannels,
      },
      {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        selectedCount: newSelected.size,
        itemCount: manualItems.length,
      },
    )
  }

  const isAnySyncPending =
    activeAction !== null ||
    runningResourceKey !== null ||
    (progress?.isRunning ?? false)

  const renderTabs = () => (
    <Tabs
      value={getTabValueFromIndex(selectedTab)}
      onValueChange={(value) => {
        handleTabChange(
          value === TAB_VALUE.manual ? TAB_INDEX.manual : TAB_INDEX.history,
        )
      }}
    >
      <TabsList className="mb-4 flex space-x-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        <TabsTrigger
          value={TAB_VALUE.history}
          className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow dark:text-gray-300 dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-400"
        >
          {historyTabLabel}
        </TabsTrigger>
        <TabsTrigger
          value={TAB_VALUE.manual}
          className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow dark:text-gray-300 dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-400"
        >
          {manualTabLabel}
        </TabsTrigger>
      </TabsList>
      {routeResourceUnavailable && (
        <Alert variant="warning" role="status" className="mb-4">
          {t("execution.table.resourceUnavailable")}
        </Alert>
      )}
      <TabsContent value={TAB_VALUE.history}>
        <div className="space-y-4">
          <ActionBar
            isRunning={isAnySyncPending || isLoading || isManualRefreshPending}
            activeAction={activeAction}
            isRefreshing={isManualRefreshPending}
            selectedCount={historySelectedKeys.size}
            failedCount={retryableFailedRefs.length}
            onRunAll={handleRunAll}
            onRunSelected={() => handleRunSelected("history")}
            onRetryFailed={() => void handleRetryFailed(retryableFailedRefs)}
            onRefresh={handleRefresh}
          />

          {hasHistory && (
            <div className="mt-2">
              <FilterBar
                statistics={lastExecution.statistics}
                status={filterStatus}
                keyword={searchKeyword}
                onStatusChange={handleHistoryStatusChange}
                onKeywordChange={handleHistorySearchChange}
              />
            </div>
          )}

          {!hasResults ? (
            <EmptyResults hasHistory={hasHistory} />
          ) : (
            <ResultsTable
              items={filteredItems || []}
              selectedKeys={historySelectedKeys}
              onSelectAll={handleHistorySelectAll}
              onSelectItem={handleHistorySelectItem}
              onRunSingle={handleRunSingle}
              isRunning={isAnySyncPending}
              runningResourceKey={runningResourceKey}
              canUseResource={canUseResource}
            />
          )}
        </div>
      </TabsContent>
      <TabsContent value={TAB_VALUE.manual}>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("execution.manual.description")}
            </p>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="md:w-64">
                <Input
                  type="text"
                  placeholder={
                    t("execution.manual.searchPlaceholder") as string
                  }
                  value={manualSearchKeyword}
                  onChange={(e) => handleManualSearchChange(e.target.value)}
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </div>
              <Button
                onClick={() => handleRunSelected("manual")}
                variant="secondary"
                disabled={
                  isAnySyncPending ||
                  isManualChannelRefresh ||
                  manualSelectedKeys.size === 0
                }
                loading={
                  activeAction ===
                  MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_SELECTED_MANUAL
                }
              >
                {activeAction ===
                MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_SELECTED_MANUAL
                  ? t("execution.actions.runningSelected")
                  : `${t("execution.actions.runSelected")} (${manualSelectedKeys.size})`}
              </Button>
              <Button
                onClick={() => void handleManualChannelRefresh()}
                variant="ghost"
                disabled={isChannelsLoading || isAnySyncPending}
                loading={isManualChannelRefresh}
                leftIcon={<RefreshCcw className="h-4 w-4" />}
              >
                {isManualChannelRefresh
                  ? t("common:status.refreshing")
                  : t("execution.actions.refresh")}
              </Button>
            </div>
          </div>

          {isChannelsLoading ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {t("execution.manual.loading")}
            </div>
          ) : manualHasResults ? (
            <ResultsTable
              items={manualItems}
              selectedKeys={manualSelectedKeys}
              onSelectAll={handleManualSelectAll}
              onSelectItem={handleManualSelectItem}
              onRunSingle={handleRunSingle}
              isRunning={isAnySyncPending}
              runningResourceKey={runningResourceKey}
              canUseResource={canUseResource}
              visibleColumns={{
                status: false,
                message: false,
                attempts: false,
                finishedAt: false,
              }}
            />
          ) : (
            <EmptyState
              title={t("execution.manual.empty.title")}
              description={
                channelsError
                  ? channelsError
                  : (t("execution.manual.empty.description") as string)
              }
              icon={<Search className="h-12 w-12" />}
              action={{
                label: t("execution.manual.reload"),
                onClick: () => void loadChannels(),
              }}
            />
          )}
        </div>
      </TabsContent>
    </Tabs>
  )

  return (
    <div className="p-6">
      <PageHeader
        icon={RefreshCcw}
        title={t("execution.title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId="managedSite"
            anchor="managed-site-model-sync"
          />
        }
        description={t("description")}
        actions={
          <ManagedSiteTypeSwitcher
            ariaLabel={t("settings:managedSite.siteTypeLabel")}
            hideWhenSingleOption
            size="sm"
            triggerClassName="w-auto min-w-[172px]"
          />
        }
        spacing="compact"
      />

      {!isModelSyncUnsupported && !isConfigMissing ? (
        <p className="mb-6 text-sm leading-6 text-slate-600 dark:text-slate-400">
          {t("managedSiteModelSync:optionalGuidance.description")}
        </p>
      ) : null}

      {isModelSyncUnsupported ? (
        <EmptyState
          className="mt-6"
          icon={<RefreshCcw className="h-12 w-12 text-slate-400" />}
          title={t("managedSiteModelSync:execution.unsupported.title")}
          description={getManagedSiteUnsupportedModelSyncMessage(
            t,
            managedSiteType,
          )}
        />
      ) : isConfigMissing ? (
        <ManagedSiteConfigRequiredState
          description={getManagedSiteConfigMissingMessage(
            t,
            getManagedSiteMessagesKeyFromSiteType(managedSiteType),
          )}
          className="mt-6"
        />
      ) : (
        <>
          <div className="mb-6">
            <OverviewCard
              enabled={isAutoSyncEnabled}
              intervalMs={intervalMs}
              nextScheduledAt={nextScheduledAt}
              lastRunAt={lastExecution?.statistics?.endedAt ?? null}
              configureAutoSyncAnalyticsAction={{
                ...actionBarAnalyticsScope,
                actionId:
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteModelSyncSettings,
              }}
              onConfigureAutoSync={() => {
                void openSettingsTab("managedSite", {
                  preserveHistory: true,
                  anchor: SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC,
                })
              }}
            />
          </div>

          {progress?.isRunning && (
            <div className="mb-6">
              <ProgressCard progress={progress} />
            </div>
          )}

          {lastExecution?.statistics && (
            <div className="mb-6">
              <StatisticsCard statistics={lastExecution.statistics} />
            </div>
          )}

          {renderTabs()}
        </>
      )}
    </div>
  )
}
