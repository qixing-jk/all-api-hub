import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/dispatch"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"

import type { UnifiedApiGuidanceAction, UnifiedApiGuidanceModel } from "./model"

export type UnifiedApiGuidanceSurfaceId =
  typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance

/**
 * Tracks a unified API guidance CTA click with fixed, privacy-safe dimensions.
 */
export function trackUnifiedApiGuidanceAction(params: {
  model: UnifiedApiGuidanceModel
  action: UnifiedApiGuidanceAction
  surfaceId: UnifiedApiGuidanceSurfaceId
}) {
  const managedSiteType = resolveProductAnalyticsManagedSiteType(
    params.model.managedSiteType,
  )

  return trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
      surface_id: params.surfaceId,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
      target_page_id: params.action.target.menuItemId,
      route_params_present: Boolean(
        params.action.target.params &&
          Object.keys(params.action.target.params).length > 0,
      ),
      guidance_status: params.model.status,
      guidance_action_kind: params.action.kind,
      ...(managedSiteType ? { managed_site_type: managedSiteType } : {}),
    },
  )
}
