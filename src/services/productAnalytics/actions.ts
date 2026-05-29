import { createLogger } from "~/utils/core/logger"

import { API_ERROR_CODES } from "../apiService/common/errors"
import type { ProductAnalyticsActionContext } from "./actionConfig"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
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
  type ProductAnalyticsTargetKind,
  type ProductAnalyticsTargetState,
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
  targetKind?: ProductAnalyticsTargetKind
  targetState?: ProductAnalyticsTargetState
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
  filterCount?: number
  resultCount?: number
  usageDataPresent?: boolean
}

export type ProductAnalyticsActionCompleteOptions = {
  errorCategory?: ProductAnalyticsErrorCategory
  durationMs?: number
  insights?: ProductAnalyticsActionInsights
}

type StructuredAnalyticsError = {
  statusCode?: unknown
  status?: unknown
  code?: unknown
  originalCode?: unknown
  name?: unknown
  cause?: unknown
}

/** Checks whether an unknown value can expose structured error metadata. */
function isStructuredAnalyticsError(
  error: unknown,
): error is StructuredAnalyticsError {
  return typeof error === "object" && error !== null
}

/** Extracts a numeric HTTP status from known structured error fields. */
function getStructuredErrorStatusCode(error: StructuredAnalyticsError) {
  const statusCode = error.statusCode ?? error.status
  return typeof statusCode === "number" &&
    Number.isInteger(statusCode) &&
    statusCode >= 100 &&
    statusCode <= 599
    ? statusCode
    : undefined
}

/** Returns controlled machine-readable error codes from known error fields. */
function getStructuredErrorCodes(error: StructuredAnalyticsError) {
  return [error.code, error.originalCode].filter(
    (value): value is string => typeof value === "string",
  )
}

/** Detects browser fetch failures without using provider/backend text. */
function isBrowserNetworkError(error: StructuredAnalyticsError) {
  if (error.name === "NetworkError") return true

  return (
    error.name === "TypeError" &&
    error instanceof Error &&
    /fetch/i.test(error.message)
  )
}

/** Maps repo API error codes to the coarse analytics taxonomy. */
function resolveProductAnalyticsCategoryFromCode(code: string) {
  switch (code) {
    case API_ERROR_CODES.HTTP_401:
    case API_ERROR_CODES.HTTP_403:
    case API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
    case API_ERROR_CODES.HTTP_429:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit
    case API_ERROR_CODES.NETWORK_ERROR:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
    case API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission
    case API_ERROR_CODES.TEMP_WINDOW_DISABLED:
    case API_ERROR_CODES.TEMP_WINDOW_WINDOWS_API_UNAVAILABLE:
    case API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE:
    case API_ERROR_CODES.TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE:
    case API_ERROR_CODES.FEATURE_UNSUPPORTED:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
    case API_ERROR_CODES.CONTENT_TYPE_MISMATCH:
    case API_ERROR_CODES.JSON_PARSE_ERROR:
    case API_ERROR_CODES.BUSINESS_ERROR:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    default:
      return undefined
  }
}

/** Maps HTTP status codes to the coarse analytics taxonomy. */
function resolveProductAnalyticsCategoryFromStatus(statusCode: number) {
  if (statusCode === 401 || statusCode === 403) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
  }
  if (statusCode === 408) return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
  if (statusCode === 429) return PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit
  if (statusCode === 400 || statusCode === 422) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
  }
  if (statusCode === 404 || statusCode === 405) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
  }
  if (statusCode >= 500) return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
  return undefined
}

/**
 * Maps structured error metadata into coarse analytics categories.
 */
export function resolveProductAnalyticsErrorCategoryFromError(
  error: unknown,
): ProductAnalyticsErrorCategory {
  if (!isStructuredAnalyticsError(error)) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  }

  const statusCategory = getStructuredErrorStatusCode(error)
  if (typeof statusCategory === "number") {
    const category = resolveProductAnalyticsCategoryFromStatus(statusCategory)
    if (category) return category
  }

  for (const code of getStructuredErrorCodes(error)) {
    const category = resolveProductAnalyticsCategoryFromCode(code)
    if (category) return category
  }

  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
  }

  if (
    error.name === "NotAllowedError" ||
    error.name === "SecurityError" ||
    error.name === "PermissionDeniedError"
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission
  }

  if (error.name === "NotFoundError" || error.name === "NotSupportedError") {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
  }

  if (isBrowserNetworkError(error)) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
  }

  if (error.cause && error.cause !== error) {
    return resolveProductAnalyticsErrorCategoryFromError(error.cause)
  }

  return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
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
    ...(insights.targetKind ? { target_kind: insights.targetKind } : {}),
    ...(insights.targetState ? { target_state: insights.targetState } : {}),
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
    ...(typeof insights.filterCount === "number"
      ? { filter_count_bucket: bucketCount(insights.filterCount) }
      : {}),
    ...(typeof insights.resultCount === "number"
      ? { result_count_bucket: bucketCount(insights.resultCount) }
      : {}),
    ...(typeof insights.usageDataPresent === "boolean"
      ? { usage_data_present: insights.usageDataPresent }
      : {}),
  }
}

/**
 * Resolves an explicit failure stage or applies a coarse fallback for failures.
 */
function resolveProductAnalyticsFailureStage({
  result,
  insights,
}: {
  result: ProductAnalyticsResult
  insights?: ProductAnalyticsActionInsights
}) {
  if (insights?.failureStage) return insights.failureStage

  return result === PRODUCT_ANALYTICS_RESULTS.Failure
    ? PRODUCT_ANALYTICS_FAILURE_STAGES.Execute
    : undefined
}

/**
 * Failed task completions should always carry a coarse category so diagnostics
 * can distinguish explicitly unknown failures from missing instrumentation.
 */
function resolveProductAnalyticsErrorCategory({
  result,
  errorCategory,
}: {
  result: ProductAnalyticsResult
  errorCategory?: ProductAnalyticsErrorCategory
}) {
  if (errorCategory) return errorCategory

  return result === PRODUCT_ANALYTICS_RESULTS.Failure
    ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
    : undefined
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
    const failureStage = resolveProductAnalyticsFailureStage({
      result,
      insights,
    })
    const resolvedErrorCategory = resolveProductAnalyticsErrorCategory({
      result,
      errorCategory,
    })

    await trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: featureId,
        action_id: actionId,
        ...(surfaceId ? { surface_id: surfaceId } : {}),
        entrypoint,
        result,
        ...(resolvedErrorCategory
          ? { error_category: resolvedErrorCategory }
          : {}),
        ...(typeof durationMs === "number"
          ? { duration_bucket: bucketDurationMs(durationMs) }
          : {}),
        ...mapProductAnalyticsActionInsights(insights),
        ...(failureStage ? { failure_stage: failureStage } : {}),
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
