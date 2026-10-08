import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  type PRODUCT_ANALYTICS_ACTION_IDS,
  type PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

export const nativeChannelActionAnalyticsContext = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) => ({
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
  actionId,
  surfaceId,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
})

export const trackNativeChannelActionStarted = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) =>
  void trackProductAnalyticsActionStarted(
    nativeChannelActionAnalyticsContext(actionId, surfaceId),
  )
