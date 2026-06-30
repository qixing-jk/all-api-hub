import { productAnalyticsClient } from "~/services/productAnalytics/client"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  productAnalyticsState,
  type ProductAnalyticsSponsorRecommendationsSummaryPatch,
  type ProductAnalyticsSponsorRecommendationsSummaryState,
} from "~/services/productAnalytics/state"

/**
 * Formats timestamps into the UTC day bucket used for daily summaries.
 */
function getUtcDay(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * Builds an empty sponsor recommendation daily summary for the given UTC day.
 */
function emptySummary(
  day = getUtcDay(),
): ProductAnalyticsSponsorRecommendationsSummaryState {
  return {
    day,
    impressionCount: 0,
    itemTotal: 0,
    supportedItemTotal: 0,
    unsupportedItemTotal: 0,
    addAccountSurfaceCount: 0,
    newcomerSurfaceCount: 0,
  }
}

/**
 * Checks whether a summary contains any sponsor recommendation impressions.
 */
function hasSummaryActivity(
  summary: ProductAnalyticsSponsorRecommendationsSummaryState,
) {
  return (summary.impressionCount ?? 0) > 0
}

/**
 * Converts local sponsor recommendation counters into analytics properties.
 */
function buildSummaryProperties(
  summary: ProductAnalyticsSponsorRecommendationsSummaryState,
) {
  return {
    feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.SponsorRecommendations,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    day: summary.day ?? getUtcDay(),
    impression_count: summary.impressionCount ?? 0,
    item_total: summary.itemTotal ?? 0,
    supported_item_total: summary.supportedItemTotal ?? 0,
    unsupported_item_total: summary.unsupportedItemTotal ?? 0,
    add_account_surface_count: summary.addAccountSurfaceCount ?? 0,
    newcomer_surface_count: summary.newcomerSurfaceCount ?? 0,
  }
}

/**
 * Persists a sponsor recommendation summary increment for the current day.
 */
export async function recordSponsorRecommendationsSummary(
  patch: ProductAnalyticsSponsorRecommendationsSummaryPatch,
) {
  await productAnalyticsState.incrementSponsorRecommendationsSummary(patch)
}

/**
 * Sends the previous UTC day's sponsor recommendations summary when active.
 */
export async function flushSponsorRecommendationsDailySummary(): Promise<boolean> {
  const summary =
    await productAnalyticsState.getSponsorRecommendationsSummaryState()
  const today = getUtcDay()

  if (!summary.day || summary.day === today || !hasSummaryActivity(summary)) {
    return false
  }

  const captured = await productAnalyticsClient.capture(
    PRODUCT_ANALYTICS_EVENTS.SponsorRecommendationsDailySummaryCaptured,
    buildSummaryProperties(summary),
  )
  if (!captured) return false

  return await productAnalyticsState.replaceSponsorRecommendationsSummaryState(
    emptySummary(today),
  )
}
