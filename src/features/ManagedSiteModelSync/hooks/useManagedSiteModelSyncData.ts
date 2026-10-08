import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import toast from "~/lib/notify"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ManagedModelChannelSummary } from "~/types/managedResourceModels"
import type {
  ExecutionHistoryResult,
  ExecutionProgress,
} from "~/types/managedSiteModelSync"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { createLogger } from "~/utils/core/logger"

import type { SyncRequestToken } from "../contracts"
import {
  actionBarAnalyticsScope,
  manualPanelAnalyticsScope,
  startModelSyncAnalytics,
  useModelSyncAnalytics,
} from "../modelSyncAnalytics"

const logger = createLogger("ManagedSiteModelSyncPage")
const MODEL_SYNC_PROGRESS_POLL_INTERVAL_MS = 5_000
const getItemCount = (items?: unknown[]) => items?.length ?? 0
/** Own a managed target session, its queries and its exclusive foreground request gate. */
export function useManagedSiteModelSyncData({
  isConfigMissing,
  isModelSyncUnsupported,
  managedSiteConfigFingerprint,
  managedSiteType,
  refreshKey,
}: {
  isConfigMissing: boolean
  isModelSyncUnsupported: boolean
  managedSiteConfigFingerprint: string
  managedSiteType: ManagedSiteType
  refreshKey?: number
}) {
  const { t } = useTranslation([
    "managedSiteModelSync",
    "settings",
    "messages",
    "common",
  ])
  const configMissingTrackedFor = useRef<string | null>(null)
  const contextGenerationRef = useRef(0)
  const lastExecutionRequestIdRef = useRef(0)
  const channelsRequestIdRef = useRef(0)
  const lastExecutionLoadingRequestIdsRef = useRef<Set<number>>(new Set())
  const nextSyncRequestIdRef = useRef(0)
  const activeSyncRequestRef = useRef<SyncRequestToken | null>(null)
  const [lastExecution, setLastExecution] =
    useState<ExecutionHistoryResult | null>(null)
  const [progress, setProgress] = useState<ExecutionProgress | null>(null)
  const [nextScheduledAt, setNextScheduledAt] = useState<string | null>(null)
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(false)
  const [intervalMs, setIntervalMs] = useState<number | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [isManualRefreshPending, setIsManualRefreshPending] = useState(false)
  const [channels, setChannels] = useState<ManagedModelChannelSummary[]>([])
  const [isChannelsLoading, setIsChannelsLoading] = useState(false)
  const [isManualChannelRefresh, setIsManualChannelRefresh] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [hasAttemptedChannelsLoad, setHasAttemptedChannelsLoad] =
    useState(false)

  const { completeModelSyncActionAnalytics } =
    useModelSyncAnalytics(managedSiteType)
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
    setLastExecution(null)
    setProgress(null)
    setNextScheduledAt(null)
    setIsAutoSyncEnabled(false)
    setIntervalMs(undefined)
    setIsManualRefreshPending(false)
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

  return {
    lastExecution,
    progress,
    nextScheduledAt,
    isAutoSyncEnabled,
    intervalMs,
    isLoading,
    isManualRefreshPending,
    channels,
    isChannelsLoading,
    isManualChannelRefresh,
    channelsError,
    hasAttemptedChannelsLoad,
    loadChannels,
    handleManualChannelRefresh,
    handleRefresh,
    acceptExecution: setLastExecution,
    requestGate: {
      tryStart: tryStartSyncRequest,
      isCurrent: isCurrentSyncRequest,
      finish: finishSyncRequest,
    },
  }
}
