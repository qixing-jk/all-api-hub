import { useCallback, useLayoutEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import {
  isManagedResourceRefFor,
  MANAGED_RESOURCE_FAILURE_CODES,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
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
  scopeKey: string
  onModelsChanged?: (
    modelsByResourceKey: ReadonlyMap<string, string>,
  ) =>
    | void
    | ManagedResourceReconcileResult
    | Promise<void | ManagedResourceReconcileResult>
}

/** Owns model-sync execution, feedback, analytics, and per-channel busy state. */
export function useManagedSiteChannelModelSync({
  siteType,
  scopeKey,
  onModelsChanged,
}: UseManagedSiteChannelModelSyncOptions) {
  const { t } = useTranslation("managedSiteChannels")
  const [syncingResourceKeys, setSyncingResourceKeys] = useState<Set<string>>(
    new Set(),
  )
  const syncGenerationRef = useRef(0)
  const inFlightChannelCountsRef = useRef(new Map<string, number>())
  const managedSiteAnalyticsType =
    resolveProductAnalyticsManagedSiteType(siteType)

  useLayoutEffect(() => {
    const inFlightChannelCounts = inFlightChannelCountsRef.current
    syncGenerationRef.current += 1
    inFlightChannelCounts.clear()
    setSyncingResourceKeys(new Set())
    return () => {
      syncGenerationRef.current += 1
      inFlightChannelCounts.clear()
    }
  }, [siteType, scopeKey])

  const syncChannels = useCallback(
    async (
      resourceRefs: readonly ManagedResourceRef[],
      analyticsContext: ProductAnalyticsActionContext,
    ) => {
      const tracker = startProductAnalyticsAction(analyticsContext)
      const eligibleResourceRefs = resourceRefs.filter((ref) =>
        isManagedResourceRefFor(ref, { siteType, kind: "channel", scopeKey }),
      )
      const eligibleResourceKeys = eligibleResourceRefs.map(
        getManagedResourceRefKey,
      )
      const requestGeneration = syncGenerationRef.current

      if (!eligibleResourceKeys.length) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          insights: {
            itemCount: 0,
            selectedCount: resourceRefs.length,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
        return
      }

      eligibleResourceKeys.forEach((id) => {
        inFlightChannelCountsRef.current.set(
          id,
          (inFlightChannelCountsRef.current.get(id) ?? 0) + 1,
        )
      })
      setSyncingResourceKeys(
        (current) => new Set([...current, ...eligibleResourceKeys]),
      )

      try {
        const response = await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
          PROTECTION_BYPASS_SURFACES.Options,
          async (protectionBypassExecution) =>
            await sendModelSyncMessage(ModelSyncMessageTypes.TriggerSelected, {
              resourceRefs: eligibleResourceRefs,
              protectionBypassExecution,
            }),
        )
        if (requestGeneration !== syncGenerationRef.current) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            insights: {
              itemCount: eligibleResourceKeys.length,
              selectedCount: resourceRefs.length,
              managedSiteType: managedSiteAnalyticsType,
            },
          })
          return
        }
        if (!response?.success) {
          throw new Error(response?.error || t("toasts.syncFailedFallback"))
        }

        const successCount =
          response.data?.statistics?.successCount ?? eligibleResourceKeys.length
        const failureCount =
          response.data?.statistics?.failureCount ??
          Math.max(eligibleResourceKeys.length - successCount, 0)
        const modelsByResourceKey = new Map<string, string>(
          (response.data?.items ?? [])
            .filter(
              (item: ExecutionItemResult) =>
                item.ok &&
                Boolean(item.newModels) &&
                eligibleResourceKeys.includes(
                  getManagedResourceRefKey(item.resourceRef),
                ),
            )
            .map((item: ExecutionItemResult) => [
              getManagedResourceRefKey(item.resourceRef),
              item.newModels!.join(","),
            ]),
        )

        let reconciliation: void | ManagedResourceReconcileResult
        try {
          reconciliation = await onModelsChanged?.(modelsByResourceKey)
        } catch {
          reconciliation = {
            outcome: "failed",
            failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
          }
        }
        if (requestGeneration !== syncGenerationRef.current) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            insights: {
              itemCount: eligibleResourceKeys.length,
              selectedCount: resourceRefs.length,
              managedSiteType: managedSiteAnalyticsType,
            },
          })
          return
        }
        const completionValues = {
          success: successCount,
          total: eligibleResourceKeys.length,
        }
        if (reconciliation?.outcome === "failed") {
          toast.error(t("toasts.syncCompletedRefreshFailed", completionValues))
        } else {
          toast.success(t("toasts.syncCompleted", completionValues))
        }
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: eligibleResourceKeys.length,
            selectedCount: resourceRefs.length,
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
              itemCount: eligibleResourceKeys.length,
              selectedCount: resourceRefs.length,
              managedSiteType: managedSiteAnalyticsType,
            },
          })
          return
        }
        toast.error(t("toasts.syncFailed", { error: getErrorMessage(error) }))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: eligibleResourceKeys.length,
            selectedCount: resourceRefs.length,
            managedSiteType: managedSiteAnalyticsType,
          },
        })
      } finally {
        if (requestGeneration === syncGenerationRef.current) {
          eligibleResourceKeys.forEach((id) => {
            const count = inFlightChannelCountsRef.current.get(id) ?? 0
            if (count <= 1) {
              inFlightChannelCountsRef.current.delete(id)
            } else {
              inFlightChannelCountsRef.current.set(id, count - 1)
            }
          })
          setSyncingResourceKeys((current) => {
            const next = new Set(current)
            eligibleResourceKeys.forEach((id) => {
              if (!inFlightChannelCountsRef.current.has(id)) {
                next.delete(id)
              }
            })
            return next
          })
        }
      }
    },
    [managedSiteAnalyticsType, onModelsChanged, scopeKey, siteType, t],
  )

  return { syncingResourceKeys, syncChannels }
}
