import type { Dispatch, SetStateAction } from "react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import {
  MANAGED_SITE_MODEL_SYNC_ACTIONS,
  type ManagedSiteModelSyncAction,
} from "~/features/ManagedSiteModelSync/actionState"
import { getModelSyncHistoryItemKey } from "~/features/ManagedSiteModelSync/executionIdentity"
import toast from "~/lib/notify"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ExecutionResult } from "~/types/managedSiteModelSync"

import {
  actionBarAnalyticsScope,
  hasModelSyncFailures,
  manualPanelAnalyticsScope,
  resultsTableAnalyticsScope,
  startModelSyncAnalytics,
  useModelSyncAnalytics,
} from "../modelSyncAnalytics"
import type { useManagedSiteModelSyncData } from "./useManagedSiteModelSyncData"

type CommandsInput = {
  data: ReturnType<typeof useManagedSiteModelSyncData>
  canUseResource: (ref: ManagedResourceRef) => boolean
  managedSiteType: ManagedSiteType
  managedSiteConfigFingerprint: string
  isConfigMissing: boolean
  isModelSyncUnsupported: boolean
  selection: {
    historySelectedKeys: Set<string>
    manualSelectedKeys: Set<string>
    setHistorySelectedKeys: Dispatch<SetStateAction<Set<string>>>
    setManualSelectedKeys: Dispatch<SetStateAction<Set<string>>>
  }
}
/** Execute explicit sync commands against the current target session. */
export function useManagedSiteModelSyncCommands({
  data,
  canUseResource,
  managedSiteType,
  managedSiteConfigFingerprint,
  isConfigMissing,
  isModelSyncUnsupported,
  selection,
}: CommandsInput) {
  const { t } = useTranslation([
    "managedSiteModelSync",
    "settings",
    "messages",
    "common",
  ])
  const {
    lastExecution,
    channels,
    acceptExecution: setLastExecution,
    requestGate,
  } = data
  const {
    tryStart: tryStartSyncRequest,
    isCurrent: isCurrentSyncRequest,
    finish: finishSyncRequest,
  } = requestGate
  const {
    historySelectedKeys,
    manualSelectedKeys,
    setHistorySelectedKeys,
    setManualSelectedKeys,
  } = selection
  const {
    completeModelSyncExecutionAnalytics,
    completeModelSyncActionAnalytics,
  } = useModelSyncAnalytics(managedSiteType)
  const [activeAction, setActiveAction] =
    useState<ManagedSiteModelSyncAction | null>(null)
  const [runningResourceKey, setRunningResourceKey] = useState<string | null>(
    null,
  )
  useEffect(() => {
    setActiveAction(null)
    setRunningResourceKey(null)
  }, [managedSiteConfigFingerprint, isConfigMissing, isModelSyncUnsupported])
  const runManualModelSync = async <T>(
    work: (protectionBypassExecution: ProtectionBypassExecution) => Promise<T>,
  ) => {
    return await withProtectionBypassUserCommand(
      PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
      PROTECTION_BYPASS_SURFACES.Options,
      work,
    )
  }
  /**
   * Shows a toast notification based on the execution result, highlighting any failures and providing a retry action if needed.
   */
  function notifySyncCompletion(execution: ExecutionResult) {
    if (hasModelSyncFailures(execution)) {
      toast.warning(
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
      // The background runner owns fresh inventory and validates the full sync batch.
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

  return {
    activeAction,
    runningResourceKey,
    retryableFailedRefs,
    handleRetryFailed,
    handleRunAll,
    handleRunSelected,
    handleRunSingle,
  }
}
