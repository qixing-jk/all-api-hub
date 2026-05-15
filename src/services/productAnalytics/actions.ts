import { createLogger } from "~/utils/core/logger"

import type { ProductAnalyticsActionContext } from "./actionConfig"
import {
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_RESULTS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsApiType,
  type ProductAnalyticsEditorMode,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureStage,
  type ProductAnalyticsManagedSiteType,
  type ProductAnalyticsModeId,
  type ProductAnalyticsResult,
  type ProductAnalyticsSourceKind,
  type ProductAnalyticsStatusKind,
  type ProductAnalyticsTelemetrySource,
} from "./events"
import { bucketCount, bucketDurationMs } from "./privacy"

export {
  resolveProductAnalyticsActionContext,
  type ProductAnalyticsActionContext,
} from "./actionConfig"

const logger = createLogger("ProductAnalyticsActions")

type ProductAnalyticsActionCompletion = ProductAnalyticsActionContext & {
  result: ProductAnalyticsResult
  errorCategory?: ProductAnalyticsErrorCategory
  durationMs?: number
  insights?: ProductAnalyticsActionInsights
}

export type ProductAnalyticsActionInsights = {
  apiType?: ProductAnalyticsApiType
  sourceKind?: ProductAnalyticsSourceKind
  mode?: ProductAnalyticsModeId
  editorMode?: ProductAnalyticsEditorMode
  statusKind?: ProductAnalyticsStatusKind
  telemetrySource?: ProductAnalyticsTelemetrySource
  managedSiteType?: ProductAnalyticsManagedSiteType
  sourceManagedSiteType?: ProductAnalyticsManagedSiteType
  targetManagedSiteType?: ProductAnalyticsManagedSiteType
  failureStage?: ProductAnalyticsFailureStage
  itemCount?: number
  selectedCount?: number
  successCount?: number
  failureCount?: number
  skippedCount?: number
  warningCount?: number
  readyCount?: number
  blockedCount?: number
  modelCount?: number
  usageDataPresent?: boolean
}

export type ProductAnalyticsActionCompleteOptions = {
  errorCategory?: ProductAnalyticsErrorCategory
  durationMs?: number
  insights?: ProductAnalyticsActionInsights
}

/**
 * Converts controlled action insight values into sanitized analytics payload fields.
 */
function mapProductAnalyticsActionInsights(
  insights?: ProductAnalyticsActionInsights,
) {
  if (!insights) return {}

  return {
    ...(insights.apiType ? { api_type: insights.apiType } : {}),
    ...(insights.sourceKind ? { source_kind: insights.sourceKind } : {}),
    ...(insights.mode ? { mode: insights.mode } : {}),
    ...(insights.editorMode ? { editor_mode: insights.editorMode } : {}),
    ...(insights.statusKind ? { status_kind: insights.statusKind } : {}),
    ...(insights.telemetrySource
      ? { telemetry_source: insights.telemetrySource }
      : {}),
    ...(insights.managedSiteType
      ? { managed_site_type: insights.managedSiteType }
      : {}),
    ...(insights.sourceManagedSiteType
      ? { source_managed_site_type: insights.sourceManagedSiteType }
      : {}),
    ...(insights.targetManagedSiteType
      ? { target_managed_site_type: insights.targetManagedSiteType }
      : {}),
    ...(insights.failureStage ? { failure_stage: insights.failureStage } : {}),
    ...(typeof insights.itemCount === "number"
      ? { item_count_bucket: bucketCount(insights.itemCount) }
      : {}),
    ...(typeof insights.selectedCount === "number"
      ? { selected_count_bucket: bucketCount(insights.selectedCount) }
      : {}),
    ...(typeof insights.successCount === "number"
      ? { success_count_bucket: bucketCount(insights.successCount) }
      : {}),
    ...(typeof insights.failureCount === "number"
      ? { failure_count_bucket: bucketCount(insights.failureCount) }
      : {}),
    ...(typeof insights.skippedCount === "number"
      ? { skipped_count_bucket: bucketCount(insights.skippedCount) }
      : {}),
    ...(typeof insights.warningCount === "number"
      ? { warning_count_bucket: bucketCount(insights.warningCount) }
      : {}),
    ...(typeof insights.readyCount === "number"
      ? { ready_count_bucket: bucketCount(insights.readyCount) }
      : {}),
    ...(typeof insights.blockedCount === "number"
      ? { blocked_count_bucket: bucketCount(insights.blockedCount) }
      : {}),
    ...(typeof insights.modelCount === "number"
      ? { model_count_bucket: bucketCount(insights.modelCount) }
      : {}),
    ...(typeof insights.usageDataPresent === "boolean"
      ? { usage_data_present: insights.usageDataPresent }
      : {}),
  }
}

/**
 * Tracks explicit UI intent using fixed analytics enums only.
 */
export async function trackProductAnalyticsActionStarted({
  featureId,
  actionId,
  surfaceId,
  entrypoint,
}: ProductAnalyticsActionContext) {
  try {
    await trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
      {
        feature_id: featureId,
        action_id: actionId,
        ...(surfaceId ? { surface_id: surfaceId } : {}),
        entrypoint,
      },
    )
  } catch (error) {
    logger.warn("Product analytics action start failed", error)
  }
}

/**
 * Tracks a business action outcome without accepting raw error text or details.
 */
export async function trackProductAnalyticsActionCompleted({
  featureId,
  actionId,
  surfaceId,
  entrypoint,
  result,
  errorCategory,
  durationMs,
  insights,
}: ProductAnalyticsActionCompletion) {
  try {
    await trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: featureId,
        action_id: actionId,
        ...(surfaceId ? { surface_id: surfaceId } : {}),
        entrypoint,
        result,
        ...(errorCategory ? { error_category: errorCategory } : {}),
        ...(typeof durationMs === "number"
          ? { duration_bucket: bucketDurationMs(durationMs) }
          : {}),
        ...mapProductAnalyticsActionInsights(insights),
      },
    )
  } catch (error) {
    logger.warn("Product analytics action completion failed", error)
  }
}

/**
 * Starts a manual action span and returns a completion helper with elapsed time.
 */
export function startProductAnalyticsAction(
  context: ProductAnalyticsActionContext,
) {
  const startedAt = Date.now()
  void trackProductAnalyticsActionStarted(context)

  return {
    complete(
      result: ProductAnalyticsResult = PRODUCT_ANALYTICS_RESULTS.Success,
      options: ProductAnalyticsActionCompleteOptions = {},
    ) {
      void trackProductAnalyticsActionCompleted({
        ...context,
        result,
        errorCategory: options.errorCategory,
        durationMs: options.durationMs ?? Date.now() - startedAt,
        insights: options.insights,
      })
    },
  }
}
