import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
} from "~/services/productAnalytics/contracts"

/** Starts an Account Dialog action with its shared analytics context. */
export function startAccountDialogAnalyticsAction(
  actionId: ProductAnalyticsActionId,
) {
  return startProductAnalyticsAction({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    actionId,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}
