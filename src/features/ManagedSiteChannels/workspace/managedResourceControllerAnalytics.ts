import type { ProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import type {
  ProductAnalyticsActionCompleteOptions,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsManagedSiteType,
  type ProductAnalyticsResult,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/contracts"

type ManagedResourceAnalyticsTracker = Pick<
  ReturnType<typeof startProductAnalyticsAction>,
  "complete"
>

/** Typed injection boundary for the existing Managed Site Channels taxonomy. */
export type ManagedResourceControllerAnalytics = {
  managedSiteType: ProductAnalyticsManagedSiteType
  startAction: (
    context: ProductAnalyticsActionContext,
  ) => ManagedResourceAnalyticsTracker
}

export type ManagedResourceAnalyticsCompletion = {
  complete: (
    result: ProductAnalyticsResult,
    options?: ProductAnalyticsActionCompleteOptions,
  ) => void
}

/** Starts one fixed-taxonomy action and guards its result against duplication. */
export function startManagedResourceControllerAction(
  analytics: ManagedResourceControllerAnalytics | undefined,
  actionId: ProductAnalyticsActionId,
  surfaceId: ProductAnalyticsSurfaceId,
): ManagedResourceAnalyticsCompletion | undefined {
  if (!analytics) return undefined

  const tracker = analytics.startAction({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
    actionId,
    surfaceId,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
  let completed = false

  return {
    complete(result, options = {}) {
      if (completed) return
      completed = true
      tracker.complete(result, {
        ...options,
        insights: {
          ...options.insights,
          managedSiteType: analytics.managedSiteType,
        },
      })
    },
  }
}
