import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsSurfaceId,
} from "./contracts"
import { trackProductAnalyticsEvent } from "./dispatch"

/**
 * Star promotion actions that end a prompt. Deferral and self-report resolve
 * the prompt for this surface, so they report the same completion event as a
 * star click and stay distinguishable through `action_id`.
 */
export type StarPromotionCompletionActionId =
  | typeof PRODUCT_ANALYTICS_ACTION_IDS.ClickStarPromotion
  | typeof PRODUCT_ANALYTICS_ACTION_IDS.DeferStarPromotion
  | typeof PRODUCT_ANALYTICS_ACTION_IDS.ConfirmStarPromotionAlreadyStarred
  | typeof PRODUCT_ANALYTICS_ACTION_IDS.SuppressStarPromotionDetected

/** The star promotion surface and entrypoint an event was seen from. */
interface StarPromotionEventContext {
  surfaceId: ProductAnalyticsSurfaceId
  entrypoint: ProductAnalyticsEntrypoint
}

/**
 * Reports that the star prompt became visible on one CTA surface.
 */
export function trackStarPromotionPromptShown({
  surfaceId,
  entrypoint,
}: StarPromotionEventContext) {
  void trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.StarPromotion,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.ShowStarPromotionPrompt,
      surface_id: surfaceId,
      entrypoint,
    },
  )
}

/**
 * Reports a resolved star prompt: star click, self-report, or deferral.
 */
export function trackStarPromotionAction(
  actionId: StarPromotionCompletionActionId,
  { surfaceId, entrypoint }: StarPromotionEventContext,
) {
  void trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.StarPromotion,
      action_id: actionId,
      surface_id: surfaceId,
      entrypoint,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
    },
  )
}
