import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { RefreshCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import ManagedSiteConfigRequiredState from "~/components/ManagedSiteConfigRequiredState"
import ManagedSiteTypeSwitcher from "~/components/ManagedSiteTypeSwitcher"
import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import {
  Button,
  EmptyState,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { hasValidManagedSiteConfig } from "~/services/managedSites/managedSiteService"
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
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ManagedSiteChannel } from "~/types/managedSite"
import type {
  ExecutionItemResult,
  ExecutionProgress,
  ExecutionResult,
} from "~/types/managedSiteModelSync"
import { onRuntimeMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { showWarningToast } from "~/utils/core/toastHelpers"
import { openSettingsTab } from "~/utils/navigation"

import ActionBar from "./components/ActionBar"
import EmptyResults from "./components/EmptyResults"
import FilterBar, { type FilterStatus } from "./components/FilterBar"
import LoadingSkeleton from "./components/LoadingSkeleton"
import OverviewCard from "./components/OverviewCard"
import ProgressCard from "./components/ProgressCard"
import ResultsTable from "./components/ResultsTable"
import StatisticsCard from "./components/StatisticsCard"

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
  items: ExecutionItemResult[],
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
        item.channelId.toString().includes(normalizedKeyword) ||
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
  const isConfigMissing = !hasValidManagedSiteConfig(
    preferences,
    managedSiteType,
  )
  const isModelSyncUnsupported = !supportsManagedSiteModelSync(managedSiteType)
  const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(
    null,
  )
  const [progress, setProgress] = useState<ExecutionProgress | null>(null)
  const [nextScheduledAt, setNextScheduledAt] = useState<string | null>(null)
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(false)
  const [intervalMs, setIntervalMs] = useState<number | undefined>(undefined)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [searchKeyword, setSearchKeyword] = useState("")
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<number>>(
    new Set(),
  )
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<number>>(
    new Set(),
  )
  const [isLoading, setIsLoading] = useState(true)
  const [runningChannelId, setRunningChannelId] = useState<number | null>(null)
  const [selectedTab, setSelectedTab] = useState<number>(TAB_INDEX.history)
  const [channels, setChannels] = useState<ManagedSiteChannel[]>([])
  const [isChannelsLoading, setIsChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [manualSearchKeyword, setManualSearchKeyword] = useState("")
  const [hasAttemptedChannelsLoad, setHasAttemptedChannelsLoad] =
    useState(false)

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
    try {
      setIsLoading(true)
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.GetLastExecution,
      )

      if (response.success) {
        setLastExecution(response.data)
        return getItemCount(response.data?.items)
      }
    } catch (error) {
      logger.error("Failed to load last execution", error)
    } finally {
      setIsLoading(false)
    }

    return null
  }, [])

  const loadProgress = useCallback(async () => {
    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.GetProgress,
      )

      if (response.success) {
        setProgress(response.data)
      }
    } catch (error) {
      logger.error("Failed to load progress", error)
    }
  }, [])

  const loadNextRun = useCallback(async () => {
    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.GetNextRun,
      )

      if (response.success) {
        setNextScheduledAt(response.data?.nextScheduledAt ?? null)
      }
    } catch (error) {
      logger.error("Failed to load next run", error)
    }
  }, [])

  const loadPreferences = useCallback(async () => {
    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.GetPreferences,
      )

      if (response.success) {
        setIsAutoSyncEnabled(!!response.data?.enableSync)
        setIntervalMs(response.data?.intervalMs)
      }
    } catch (error) {
      logger.error("Failed to load preferences", error)
    }
  }, [])

  const loadChannels = useCallback(async () => {
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
      } else {
        throw new Error(response.error)
      }
    } catch (error: any) {
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
    } finally {
      setIsChannelsLoading(false)
      setHasAttemptedChannelsLoad(true)
    }
  }, [completeModelSyncActionAnalytics, t])

  const handleRefresh = async () => {
    const tracker = startModelSyncAnalytics({
      ...actionBarAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteModelSyncResults,
    })

    const itemCount = await loadLastExecution()
    await Promise.all([loadProgress(), loadNextRun(), loadPreferences()])

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
  }

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
    const handleMessage = (message: any) => {
      if (message.type === "MANAGED_SITE_MODEL_SYNC_PROGRESS") {
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
    managedSiteType,
  ])

  useEffect(() => {
    hasInitializedTab.current = false
    setLastExecution(null)
    setProgress(null)
    setNextScheduledAt(null)
    setIsAutoSyncEnabled(false)
    setIntervalMs(undefined)
    setHistorySelectedIds(new Set())
    setManualSelectedIds(new Set())
    setRunningChannelId(null)
    setChannels([])
    setChannelsError(null)
    setHasAttemptedChannelsLoad(false)
    setIsLoading(!isConfigMissing && !isModelSyncUnsupported)
  }, [isConfigMissing, isModelSyncUnsupported, managedSiteType])

  useEffect(() => {
    if (!progress?.isRunning) {
      setRunningChannelId(null)
    }
  }, [progress?.isRunning])

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
    const channelId = channelIdRaw ? Number(channelIdRaw) : NaN
    const requestedTab = routeParams?.tab?.trim()

    if (!Number.isNaN(channelId)) {
      hasInitializedTab.current = true
      setSelectedTab(TAB_INDEX.manual)
      setManualSearchKeyword(String(channelId))
      setManualSelectedIds(new Set([channelId]))
      if (
        channels.length === 0 &&
        !isChannelsLoading &&
        !hasAttemptedChannelsLoad
      ) {
        void loadChannels()
      }
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
    channels.length,
    hasAttemptedChannelsLoad,
    isConfigMissing,
    isModelSyncUnsupported,
    isChannelsLoading,
    loadChannels,
    routeParams?.channelId,
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
            onClick: handleRetryFailed,
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

  /**
   * Handles retrying only the failed channels from the last execution, showing appropriate success or error toasts based on the result.
   */
  async function handleRetryFailed() {
    const tracker = startModelSyncAnalytics({
      ...actionBarAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryFailedManagedSiteModelSync,
    })

    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.TriggerFailedOnly,
      )

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
      toast.error(t("messages.error.syncFailed", { error: error.message }))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    }
  }

  const handleRunAll = async () => {
    const tracker = startModelSyncAnalytics({
      ...actionBarAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncAllManagedSiteModels,
    })

    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.TriggerAll,
      )

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
      toast.error(t("messages.error.syncFailed", { error: error.message }))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    }
  }

  const handleRunSelected = async (source: "history" | "manual") => {
    const selectedSet =
      source === "history" ? historySelectedIds : manualSelectedIds

    const tracker = startModelSyncAnalytics({
      ...(source === "history"
        ? actionBarAnalyticsScope
        : manualPanelAnalyticsScope),
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
    })

    if (selectedSet.size === 0) {
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

    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.TriggerSelected,
        {
          channelIds: Array.from(selectedSet),
        },
      )

      if (response.success) {
        notifySyncCompletion(response.data)
        setLastExecution(response.data)
        if (source === "history") {
          setHistorySelectedIds(new Set())
        } else {
          setManualSelectedIds(new Set())
        }
        completeModelSyncExecutionAnalytics(tracker, response.data, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
          sourceKind:
            source === "history"
              ? PRODUCT_ANALYTICS_SOURCE_KINDS.History
              : PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          selectedCount: selectedSet.size,
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
      toast.error(t("messages.error.syncFailed", { error: error.message }))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    }
  }

  const handleRunSingle = async (channelId: number) => {
    const tracker = startModelSyncAnalytics({
      ...resultsTableAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSingleManagedSiteModel,
    })

    setRunningChannelId(channelId)
    try {
      const response = await sendModelSyncMessage(
        ModelSyncMessageTypes.TriggerSelected,
        {
          channelIds: [channelId],
        },
      )

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
              item.channelId === channelId ? newItem : item,
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
      toast.error(t("messages.error.syncFailed", { error: error.message }))
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    } finally {
      setRunningChannelId(null)
    }
  }

  const handleHistorySelectAll = (checked: boolean) => {
    const itemCount = filteredItems?.length ?? 0
    if (checked && filteredItems) {
      setHistorySelectedIds(
        new Set(filteredItems.map((item) => item.channelId)),
      )
    } else {
      setHistorySelectedIds(new Set())
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

  const handleHistorySelectItem = (channelId: number, checked: boolean) => {
    const newSelected = new Set(historySelectedIds)
    if (checked) {
      newSelected.add(channelId)
    } else {
      newSelected.delete(channelId)
    }
    setHistorySelectedIds(newSelected)
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
            channel.id.toString().includes(keyword),
        )
      : channels

    return source.map((channel) => ({
      channelId: channel.id,
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
      setManualSelectedIds(new Set(manualItems.map((item) => item.channelId)))
    } else {
      setManualSelectedIds(new Set())
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

  const handleManualSelectItem = (channelId: number, checked: boolean) => {
    const newSelected = new Set(manualSelectedIds)
    if (checked) {
      newSelected.add(channelId)
    } else {
      newSelected.delete(channelId)
    }
    setManualSelectedIds(newSelected)
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
      <TabsContent value={TAB_VALUE.history}>
        <div className="space-y-4">
          <ActionBar
            isRunning={progress?.isRunning ?? false}
            isRefreshing={isLoading && lastExecution !== null}
            selectedCount={historySelectedIds.size}
            failedCount={lastExecution?.statistics.failureCount ?? 0}
            onRunAll={handleRunAll}
            onRunSelected={() => handleRunSelected("history")}
            onRetryFailed={handleRetryFailed}
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
              selectedIds={historySelectedIds}
              onSelectAll={handleHistorySelectAll}
              onSelectItem={handleHistorySelectItem}
              onRunSingle={handleRunSingle}
              isRunning={progress?.isRunning ?? false}
              runningChannelId={runningChannelId}
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
                  leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
                />
              </div>
              <Button
                onClick={() => handleRunSelected("manual")}
                variant="secondary"
                disabled={
                  (progress?.isRunning ?? false) || manualSelectedIds.size === 0
                }
              >
                {t("execution.actions.runSelected")} ({manualSelectedIds.size})
              </Button>
              <Button
                onClick={() => void loadChannels()}
                variant="ghost"
                disabled={isChannelsLoading}
                leftIcon={<RefreshCcw className="h-4 w-4" />}
              >
                {t("execution.actions.refresh")}
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
              selectedIds={manualSelectedIds}
              onSelectAll={handleManualSelectAll}
              onSelectItem={handleManualSelectItem}
              onRunSingle={handleRunSingle}
              isRunning={progress?.isRunning ?? false}
              runningChannelId={runningChannelId}
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
              icon={<MagnifyingGlassIcon className="h-12 w-12" />}
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

      {isModelSyncUnsupported ? (
        <EmptyState
          className="mt-6"
          icon={<RefreshCcw className="h-12 w-12 text-slate-400" />}
          title={t("managedSiteModelSync:execution.unsupported.title")}
          description={getManagedSiteUnsupportedModelSyncMessage(
            t,
            getManagedSiteMessagesKeyFromSiteType(managedSiteType),
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
