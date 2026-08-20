import { useCallback, useLayoutEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import { MANAGED_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/managedResourceNative"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  startProductAnalyticsAction,
  type ProductAnalyticsActionContext,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ExecutionItemResult } from "~/types/managedSiteModelSync"
import { getErrorMessage } from "~/utils/core/error"

import type { ManagedResourceReconcileResult } from "../controllers/useManagedResourceListController"

type UseManagedSiteChannelModelSyncOptions = {
  siteType: ManagedSiteType
  onModelsChanged?: (
    modelsByChannelId: ReadonlyMap<number, string>,
  ) =>
    | void
    | ManagedResourceReconcileResult
    | Promise<void | ManagedResourceReconcileResult>
}

/** Owns model-sync execution, feedback, analytics, and per-channel busy state. */
export function useManagedSiteChannelModelSync({
  siteType,
  onModelsChanged,
}: UseManagedSiteChannelModelSyncOptions) {
  const { t } = useTranslation("managedSiteChannels")
  const [syncingChannelIds, setSyncingChannelIds] = useState<Set<number>>(
    new Set(),
  )
  const syncGenerationRef = useRef(0)
  const managedSiteAnalyticsType =
    resolveProductAnalyticsManagedSiteType(siteType)

  useLayoutEffect(() => {
    syncGenerationRef.current += 1
    setSyncingChannelIds(new Set())
  }, [siteType])

  const syncChannels = useCallback(
    async (
      channelIds: readonly number[],
      analyticsContext: ProductAnalyticsActionContext,
    ) => {
      const tracker = startProductAnalyticsAction(analyticsContext)
      const eligibleChannelIds = channelIds.filter((id) => id > 0)
      const requestGeneration = syncGenerationRef.current

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

      setSyncingChannelIds((current) => {
        const next = new Set(current)
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
        if (requestGeneration !== syncGenerationRef.current) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            insights: {
              itemCount: eligibleChannelIds.length,
              selectedCount: channelIds.length,
              managedSiteType: managedSiteAnalyticsType,
            },
          })
          return
        }
        if (!response?.success) {
          throw new Error(response?.error || t("toasts.syncFailedFallback"))
        }

        const successCount =
          response.data?.statistics?.successCount ?? eligibleChannelIds.length
        const failureCount =
          response.data?.statistics?.failureCount ??
          Math.max(eligibleChannelIds.length - successCount, 0)
        const modelsByChannelId = new Map<number, string>(
          (response.data?.items ?? [])
            .filter(
              (item: ExecutionItemResult) => item.ok && Boolean(item.newModels),
            )
            .map((item: ExecutionItemResult) => [
              item.channelId,
              item.newModels!.join(","),
            ]),
        )

        let reconciliation: void | ManagedResourceReconcileResult
        try {
          reconciliation = await onModelsChanged?.(modelsByChannelId)
        } catch {
          reconciliation = {
            outcome: "failed",
            failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
          }
        }
        if (requestGeneration !== syncGenerationRef.current) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            insights: {
              itemCount: eligibleChannelIds.length,
              selectedCount: channelIds.length,
              managedSiteType: managedSiteAnalyticsType,
            },
          })
          return
        }
        const completionValues = {
          success: successCount,
          total: eligibleChannelIds.length,
        }
        if (reconciliation?.outcome === "failed") {
          toast.error(t("toasts.syncCompletedRefreshFailed", completionValues))
        } else {
          toast.success(t("toasts.syncCompleted", completionValues))
        }
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: eligibleChannelIds.length,
            selectedCount: channelIds.length,
            successCount,
            failureCount,
            warningCount: reconciliation?.outcome === "failed" ? 1 : 0,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
      } catch (error) {
        if (requestGeneration !== syncGenerationRef.current) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            insights: {
              itemCount: eligibleChannelIds.length,
              selectedCount: channelIds.length,
              managedSiteType: managedSiteAnalyticsType,
            },
          })
          return
        }
        toast.error(t("toasts.syncFailed", { error: getErrorMessage(error) }))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: eligibleChannelIds.length,
            selectedCount: channelIds.length,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
      } finally {
        if (requestGeneration === syncGenerationRef.current) {
          setSyncingChannelIds((current) => {
            const next = new Set(current)
            eligibleChannelIds.forEach((id) => next.delete(id))
            return next
          })
        }
      }
    },
    [managedSiteAnalyticsType, onModelsChanged, t],
  )

  return { syncingChannelIds, syncChannels }
}
