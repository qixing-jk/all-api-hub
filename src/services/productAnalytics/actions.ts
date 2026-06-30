import { createLogger } from "~/utils/core/logger"

import { API_ERROR_CODES } from "../apiService/common/errors"
import type { ProductAnalyticsActionContext } from "./actionConfig"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
  type ProductAnalyticsAccountAutoDetectFailureReason,
  type ProductAnalyticsAccountAutoDetectFetchContextKind,
  type ProductAnalyticsAccountAutoDetectStrategy,
  type ProductAnalyticsApiType,
  type ProductAnalyticsEditorMode,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
  type ProductAnalyticsManagedSiteType,
  type ProductAnalyticsModeId,
  type ProductAnalyticsRequestedAuthMode,
  type ProductAnalyticsResult,
  type ProductAnalyticsSiteType,
  type ProductAnalyticsSourceKind,
  type ProductAnalyticsStatusKind,
  type ProductAnalyticsTargetKind,
  type ProductAnalyticsTargetState,
  type ProductAnalyticsTelemetrySource,
} from "./contracts"
import { trackProductAnalyticsEvent } from "./dispatch"
import {
  resolveProductAnalyticsCategoryFromFailureReason,
  resolveProductAnalyticsFailureReasonFromLocalMessage,
} from "./errorPatternDiagnostics"

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
  diagnostics?: ProductAnalyticsActionDiagnostics
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
  failureReason?: ProductAnalyticsFailureReason
  accountAutoDetectFailureReason?: ProductAnalyticsAccountAutoDetectFailureReason
  autoDetectStrategy?: ProductAnalyticsAccountAutoDetectStrategy
  requestedAuthMode?: ProductAnalyticsRequestedAuthMode
  siteType?: ProductAnalyticsSiteType
  fetchContextKind?: ProductAnalyticsAccountAutoDetectFetchContextKind
  cacheHit?: boolean
  cacheUsed?: boolean
  fallbackAvailable?: boolean
  fallbackUsed?: boolean
  retryAttempted?: boolean
  retryCount?: number
  tempContextUsed?: boolean
  incognitoContextUsed?: boolean
  staleResponseIgnored?: boolean
  backgroundExecution?: boolean
  currentTabMatched?: boolean
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
  diagnostics?: ProductAnalyticsActionDiagnostics
}

export type ProductAnalyticsActionDiagnostics = {
  context?: {
    sourceKind?: ProductAnalyticsSourceKind
    mode?: ProductAnalyticsModeId
    apiType?: ProductAnalyticsApiType
    siteType?: ProductAnalyticsSiteType
    requestedAuthMode?: ProductAnalyticsRequestedAuthMode
    managedSiteType?: ProductAnalyticsManagedSiteType
    sourceManagedSiteType?: ProductAnalyticsManagedSiteType
    targetManagedSiteType?: ProductAnalyticsManagedSiteType
    targetKind?: ProductAnalyticsTargetKind
    targetState?: ProductAnalyticsTargetState
    telemetrySource?: ProductAnalyticsTelemetrySource
    editorMode?: ProductAnalyticsEditorMode
    statusKind?: ProductAnalyticsStatusKind
    fetchContextKind?: ProductAnalyticsAccountAutoDetectFetchContextKind
    autoDetectStrategy?: ProductAnalyticsAccountAutoDetectStrategy
  }
  execution?: {
    cacheHit?: boolean
    cacheUsed?: boolean
    fallbackAvailable?: boolean
    fallbackUsed?: boolean
    retryAttempted?: boolean
    retryCount?: number
    tempContextUsed?: boolean
    incognitoContextUsed?: boolean
    staleResponseIgnored?: boolean
    backgroundExecution?: boolean
    currentTabMatched?: boolean
  }
  outcome?: {
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
  failure?: {
    category?: ProductAnalyticsErrorCategory
    stage?: ProductAnalyticsFailureStage
    reason?: ProductAnalyticsFailureReason
    accountAutoDetectFailureReason?: ProductAnalyticsAccountAutoDetectFailureReason
  }
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

  if (error.name === "NetworkError") {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
  }
  const messageReason =
    resolveProductAnalyticsFailureReasonFromLocalMessage(error)
  if (messageReason) {
    const category =
      resolveProductAnalyticsCategoryFromFailureReason(messageReason)
    if (category) return category
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
    ...(insights.failureReason
      ? { failure_reason: insights.failureReason }
      : {}),
    ...(insights.accountAutoDetectFailureReason
      ? {
          account_auto_detect_failure_reason:
            insights.accountAutoDetectFailureReason,
        }
      : {}),
    ...(insights.autoDetectStrategy
      ? { auto_detect_strategy: insights.autoDetectStrategy }
      : {}),
    ...(insights.requestedAuthMode
      ? { requested_auth_mode: insights.requestedAuthMode }
      : {}),
    ...(insights.siteType ? { site_type: insights.siteType } : {}),
    ...(insights.fetchContextKind
      ? { fetch_context_kind: insights.fetchContextKind }
      : {}),
    ...(typeof insights.cacheHit === "boolean"
      ? { cache_hit: insights.cacheHit }
      : {}),
    ...(typeof insights.cacheUsed === "boolean"
      ? { cache_used: insights.cacheUsed }
      : {}),
    ...(typeof insights.fallbackAvailable === "boolean"
      ? { fallback_available: insights.fallbackAvailable }
      : {}),
    ...(typeof insights.fallbackUsed === "boolean"
      ? { fallback_used: insights.fallbackUsed }
      : {}),
    ...(typeof insights.retryAttempted === "boolean"
      ? { retry_attempted: insights.retryAttempted }
      : {}),
    ...(typeof insights.retryCount === "number"
      ? { retry_count: insights.retryCount }
      : {}),
    ...(typeof insights.tempContextUsed === "boolean"
      ? { temp_context_used: insights.tempContextUsed }
      : {}),
    ...(typeof insights.incognitoContextUsed === "boolean"
      ? { incognito_context_used: insights.incognitoContextUsed }
      : {}),
    ...(typeof insights.staleResponseIgnored === "boolean"
      ? { stale_response_ignored: insights.staleResponseIgnored }
      : {}),
    ...(typeof insights.backgroundExecution === "boolean"
      ? { background_execution: insights.backgroundExecution }
      : {}),
    ...(typeof insights.currentTabMatched === "boolean"
      ? { current_tab_matched: insights.currentTabMatched }
      : {}),
    ...(typeof insights.itemCount === "number"
      ? { item_count: insights.itemCount }
      : {}),
    ...(typeof insights.selectedCount === "number"
      ? { selected_count: insights.selectedCount }
      : {}),
    ...(typeof insights.successCount === "number"
      ? { success_count: insights.successCount }
      : {}),
    ...(typeof insights.failureCount === "number"
      ? { failure_count: insights.failureCount }
      : {}),
    ...(typeof insights.skippedCount === "number"
      ? { skipped_count: insights.skippedCount }
      : {}),
    ...(typeof insights.warningCount === "number"
      ? { warning_count: insights.warningCount }
      : {}),
    ...(typeof insights.readyCount === "number"
      ? { ready_count: insights.readyCount }
      : {}),
    ...(typeof insights.blockedCount === "number"
      ? { blocked_count: insights.blockedCount }
      : {}),
    ...(typeof insights.modelCount === "number"
      ? { model_count: insights.modelCount }
      : {}),
    ...(typeof insights.filterCount === "number"
      ? { filter_count: insights.filterCount }
      : {}),
    ...(typeof insights.resultCount === "number"
      ? { result_count: insights.resultCount }
      : {}),
    ...(typeof insights.usageDataPresent === "boolean"
      ? { usage_data_present: insights.usageDataPresent }
      : {}),
  }
}

/**
 * Converts structured action diagnostics into the existing flat analytics shape.
 */
function flattenProductAnalyticsActionDiagnostics(
  diagnostics?: ProductAnalyticsActionDiagnostics,
) {
  if (!diagnostics) return {}

  return {
    ...(diagnostics.context?.apiType
      ? { api_type: diagnostics.context.apiType }
      : {}),
    ...(diagnostics.context?.sourceKind
      ? { source_kind: diagnostics.context.sourceKind }
      : {}),
    ...(diagnostics.context?.mode ? { mode: diagnostics.context.mode } : {}),
    ...(diagnostics.context?.editorMode
      ? { editor_mode: diagnostics.context.editorMode }
      : {}),
    ...(diagnostics.context?.statusKind
      ? { status_kind: diagnostics.context.statusKind }
      : {}),
    ...(diagnostics.context?.telemetrySource
      ? { telemetry_source: diagnostics.context.telemetrySource }
      : {}),
    ...(diagnostics.context?.targetKind
      ? { target_kind: diagnostics.context.targetKind }
      : {}),
    ...(diagnostics.context?.targetState
      ? { target_state: diagnostics.context.targetState }
      : {}),
    ...(diagnostics.context?.managedSiteType
      ? { managed_site_type: diagnostics.context.managedSiteType }
      : {}),
    ...(diagnostics.context?.sourceManagedSiteType
      ? { source_managed_site_type: diagnostics.context.sourceManagedSiteType }
      : {}),
    ...(diagnostics.context?.targetManagedSiteType
      ? { target_managed_site_type: diagnostics.context.targetManagedSiteType }
      : {}),
    ...(diagnostics.failure?.stage
      ? { failure_stage: diagnostics.failure.stage }
      : {}),
    ...(diagnostics.failure?.reason
      ? { failure_reason: diagnostics.failure.reason }
      : {}),
    ...(diagnostics.failure?.accountAutoDetectFailureReason
      ? {
          account_auto_detect_failure_reason:
            diagnostics.failure.accountAutoDetectFailureReason,
        }
      : {}),
    ...(diagnostics.context?.autoDetectStrategy
      ? { auto_detect_strategy: diagnostics.context.autoDetectStrategy }
      : {}),
    ...(diagnostics.context?.requestedAuthMode
      ? { requested_auth_mode: diagnostics.context.requestedAuthMode }
      : {}),
    ...(diagnostics.context?.siteType
      ? { site_type: diagnostics.context.siteType }
      : {}),
    ...(diagnostics.context?.fetchContextKind
      ? { fetch_context_kind: diagnostics.context.fetchContextKind }
      : {}),
    ...(typeof diagnostics.execution?.cacheHit === "boolean"
      ? { cache_hit: diagnostics.execution.cacheHit }
      : {}),
    ...(typeof diagnostics.execution?.cacheUsed === "boolean"
      ? { cache_used: diagnostics.execution.cacheUsed }
      : {}),
    ...(typeof diagnostics.execution?.fallbackAvailable === "boolean"
      ? { fallback_available: diagnostics.execution.fallbackAvailable }
      : {}),
    ...(typeof diagnostics.execution?.fallbackUsed === "boolean"
      ? { fallback_used: diagnostics.execution.fallbackUsed }
      : {}),
    ...(typeof diagnostics.execution?.retryAttempted === "boolean"
      ? { retry_attempted: diagnostics.execution.retryAttempted }
      : {}),
    ...(typeof diagnostics.execution?.retryCount === "number"
      ? { retry_count: diagnostics.execution.retryCount }
      : {}),
    ...(typeof diagnostics.execution?.tempContextUsed === "boolean"
      ? { temp_context_used: diagnostics.execution.tempContextUsed }
      : {}),
    ...(typeof diagnostics.execution?.incognitoContextUsed === "boolean"
      ? { incognito_context_used: diagnostics.execution.incognitoContextUsed }
      : {}),
    ...(typeof diagnostics.execution?.staleResponseIgnored === "boolean"
      ? {
          stale_response_ignored: diagnostics.execution.staleResponseIgnored,
        }
      : {}),
    ...(typeof diagnostics.execution?.backgroundExecution === "boolean"
      ? { background_execution: diagnostics.execution.backgroundExecution }
      : {}),
    ...(typeof diagnostics.execution?.currentTabMatched === "boolean"
      ? { current_tab_matched: diagnostics.execution.currentTabMatched }
      : {}),
    ...(typeof diagnostics.outcome?.itemCount === "number"
      ? { item_count: diagnostics.outcome.itemCount }
      : {}),
    ...(typeof diagnostics.outcome?.selectedCount === "number"
      ? { selected_count: diagnostics.outcome.selectedCount }
      : {}),
    ...(typeof diagnostics.outcome?.successCount === "number"
      ? { success_count: diagnostics.outcome.successCount }
      : {}),
    ...(typeof diagnostics.outcome?.failureCount === "number"
      ? { failure_count: diagnostics.outcome.failureCount }
      : {}),
    ...(typeof diagnostics.outcome?.skippedCount === "number"
      ? { skipped_count: diagnostics.outcome.skippedCount }
      : {}),
    ...(typeof diagnostics.outcome?.warningCount === "number"
      ? { warning_count: diagnostics.outcome.warningCount }
      : {}),
    ...(typeof diagnostics.outcome?.readyCount === "number"
      ? { ready_count: diagnostics.outcome.readyCount }
      : {}),
    ...(typeof diagnostics.outcome?.blockedCount === "number"
      ? { blocked_count: diagnostics.outcome.blockedCount }
      : {}),
    ...(typeof diagnostics.outcome?.modelCount === "number"
      ? { model_count: diagnostics.outcome.modelCount }
      : {}),
    ...(typeof diagnostics.outcome?.filterCount === "number"
      ? { filter_count: diagnostics.outcome.filterCount }
      : {}),
    ...(typeof diagnostics.outcome?.resultCount === "number"
      ? { result_count: diagnostics.outcome.resultCount }
      : {}),
    ...(typeof diagnostics.outcome?.usageDataPresent === "boolean"
      ? { usage_data_present: diagnostics.outcome.usageDataPresent }
      : {}),
    ...(diagnostics.failure?.category
      ? { error_category: diagnostics.failure.category }
      : {}),
  }
}

/**
 * Resolves an explicit failure stage or applies a coarse fallback for failures.
 */
function resolveProductAnalyticsFailureStage({
  result,
  insights,
  diagnostics,
}: {
  result: ProductAnalyticsResult
  insights?: ProductAnalyticsActionInsights
  diagnostics?: ProductAnalyticsActionDiagnostics
}) {
  if (diagnostics?.failure?.stage) return diagnostics.failure.stage
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
  diagnostics,
}: {
  result: ProductAnalyticsResult
  errorCategory?: ProductAnalyticsErrorCategory
  diagnostics?: ProductAnalyticsActionDiagnostics
}) {
  if (errorCategory) return errorCategory
  if (diagnostics?.failure?.category) return diagnostics.failure.category

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
  diagnostics,
}: ProductAnalyticsActionCompletion) {
  try {
    const failureStage = resolveProductAnalyticsFailureStage({
      result,
      insights,
      diagnostics,
    })
    const resolvedErrorCategory = resolveProductAnalyticsErrorCategory({
      result,
      errorCategory,
      diagnostics,
    })
    const diagnosticsFields =
      flattenProductAnalyticsActionDiagnostics(diagnostics)

    await trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: featureId,
        action_id: actionId,
        ...(surfaceId ? { surface_id: surfaceId } : {}),
        entrypoint,
        result,
        ...(typeof durationMs === "number" ? { duration_ms: durationMs } : {}),
        ...mapProductAnalyticsActionInsights(insights),
        ...diagnosticsFields,
        ...(resolvedErrorCategory
          ? { error_category: resolvedErrorCategory }
          : {}),
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
        diagnostics: options.diagnostics,
      })
    },
  }
}
