import type { TFunction } from "i18next"

import { MODEL_LIST_DATA_ERROR_CODES } from "~/services/modelCatalog/errors"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_CATALOG_FAILURE_CATEGORIES,
  type ModelCatalogFailureCategory,
} from "~/services/modelList/pricingModel"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  trackProductAnalyticsActionCompleted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsApiType,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
  type ProductAnalyticsResult,
  type ProductAnalyticsSourceKind,
} from "~/services/productAnalytics/contracts"
import { buildModelListDiagnostics } from "~/services/productAnalytics/modelListDiagnostics"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"

/** Read structured codes without inferring classifications from error messages. */
function getModelDataErrorCode(error: unknown) {
  return error && typeof error === "object"
    ? (error as { code?: unknown }).code
    : undefined
}

/** Counts only valid model rows so analytics never includes raw model ids. */
export function getPricingModelCount(
  pricing: ModelCatalogSnapshot | null | undefined,
) {
  return Array.isArray(pricing?.data) ? pricing.data.length : 0
}

/**
 * Maps known loader failures into coarse analytics buckets for telemetry.
 * Unknown is intentionally the fallback to avoid guessing from raw messages.
 */
export function getModelDataErrorCategory(
  error: unknown,
): ProductAnalyticsErrorCategory {
  const code = getModelDataErrorCode(error)

  if (code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
  }

  return resolveProductAnalyticsErrorCategoryFromError(error)
}

/** Classify whether model catalog loading failed during parsing or execution. */
function getModelDataFailureStage(
  error: unknown,
): ProductAnalyticsFailureStage {
  const code = getModelDataErrorCode(error)

  return code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
    ? PRODUCT_ANALYTICS_FAILURE_STAGES.Parse
    : PRODUCT_ANALYTICS_FAILURE_STAGES.Execute
}

/** Derive coupled analytics diagnostics from a single model-data failure. */
function getModelDataFailureDiagnostics(error: unknown): {
  errorCategory: ProductAnalyticsErrorCategory
  failureStage: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
} {
  const code = getModelDataErrorCode(error)

  return {
    errorCategory: getModelDataErrorCategory(error),
    failureStage: getModelDataFailureStage(error),
    ...(code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
      ? {
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
        }
      : {}),
  }
}

/** Derive aggregate model catalog diagnostics from the failed account queries. */
export function getAggregateModelDataFailureDiagnostics(errors: unknown[]): {
  errorCategory: ProductAnalyticsErrorCategory
  failureStage: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
  error?: unknown
} {
  const diagnostics = errors.map((error) => ({
    ...getModelDataFailureDiagnostics(error),
    error,
  }))
  const representativeDiagnostic =
    diagnostics.find(
      (diagnostic) =>
        diagnostic.failureStage === PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
    ) ??
    diagnostics.find(
      (diagnostic) =>
        diagnostic.errorCategory !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )

  return (
    representativeDiagnostic ?? {
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
    }
  )
}

/** Returns a user-facing, non-secret reason for model-data load failures. */
export function getModelDataDisplayErrorReason(
  error: unknown,
  t: TFunction<"modelList">,
) {
  const code = getModelDataErrorCode(error)

  if (code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
    return t("accountSummary.failureReasons.invalidFormat")
  }

  return getErrorMessage(error) || t("accountSummary.failureReasons.unknown")
}

/** Selects the first useful display reason from a set of load failures. */
export function getFirstModelDataDisplayErrorReason(
  errors: unknown[],
  t: TFunction<"modelList">,
) {
  return (
    errors
      .map((error) => getModelDataDisplayErrorReason(error, t))
      .find(Boolean) ?? t("accountSummary.failureReasons.unknown")
  )
}

const MODEL_DATA_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelPricingData,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

/**
 * Tracks a coarse, sanitized model-data load completion outcome.
 * @param params Completion metadata to bucket and forward to analytics.
 * @param params.result Coarse load outcome.
 * @param params.sourceKind Selected model source kind.
 * @param params.errorCategory Optional sanitized failure category.
 * @param params.failureStage Optional sanitized failure stage.
 * @param params.failureReason Optional sanitized failure reason.
 * @param params.error Optional structured error object.
 * @param params.siteType Optional sanitized site type.
 * @param params.requestedAuthMode Optional sanitized auth mode.
 * @param params.apiType Optional sanitized API type.
 * @param params.cacheHit Whether the pricing cache was hit.
 * @param params.fallbackAvailable Whether fallback data was available.
 * @param params.fallbackUsed Whether fallback data was used.
 * @param params.modelCount Number of models loaded, when available.
 * @param params.successCount Number of successful account loads, when available.
 * @param params.failureCount Number of failed account loads, when available.
 */
export function trackModelDataLoadCompletion(params: {
  result: ProductAnalyticsResult
  sourceKind: ProductAnalyticsSourceKind
  errorCategory?: ProductAnalyticsErrorCategory
  failureStage?: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
  error?: unknown
  siteType?: DisplaySiteData["siteType"]
  requestedAuthMode?: DisplaySiteData["authType"]
  apiType?: ProductAnalyticsApiType
  cacheHit?: boolean
  fallbackAvailable?: boolean
  fallbackUsed?: boolean
  modelCount?: number
  successCount?: number
  failureCount?: number
}) {
  const diagnostics = buildModelListDiagnostics({
    sourceKind: params.sourceKind,
    ...(params.siteType ? { siteType: params.siteType } : {}),
    ...(params.requestedAuthMode
      ? { requestedAuthMode: params.requestedAuthMode }
      : {}),
    ...(params.apiType ? { apiType: params.apiType } : {}),
    ...(typeof params.cacheHit === "boolean"
      ? { cacheHit: params.cacheHit }
      : {}),
    ...(typeof params.fallbackAvailable === "boolean"
      ? { fallbackAvailable: params.fallbackAvailable }
      : {}),
    ...(typeof params.fallbackUsed === "boolean"
      ? { fallbackUsed: params.fallbackUsed }
      : {}),
    ...(typeof params.modelCount === "number"
      ? { modelCount: params.modelCount }
      : {}),
    ...(typeof params.successCount === "number"
      ? { successCount: params.successCount }
      : {}),
    ...(typeof params.failureCount === "number"
      ? { failureCount: params.failureCount }
      : {}),
    ...(params.error ? { error: params.error } : {}),
    ...(params.errorCategory ? { errorCategory: params.errorCategory } : {}),
    ...(params.failureStage ? { stage: params.failureStage } : {}),
    ...(params.failureReason ? { reason: params.failureReason } : {}),
  })

  void trackProductAnalyticsActionCompleted({
    ...MODEL_DATA_ANALYTICS_CONTEXT,
    result: params.result,
    ...(params.errorCategory ? { errorCategory: params.errorCategory } : {}),
    diagnostics,
  })
}

/** Resolves localized recovery copy without exposing unstable backend details. */
export function getPersonalizedCatalogFallbackMessage(
  category: ModelCatalogFailureCategory,
  t: TFunction<"modelList">,
) {
  switch (category) {
    case MODEL_CATALOG_FAILURE_CATEGORIES.AUTH:
      return t("personalizedCatalogFallback.failures.auth")
    case MODEL_CATALOG_FAILURE_CATEGORIES.PERMISSION:
      return t("personalizedCatalogFallback.failures.permission")
    case MODEL_CATALOG_FAILURE_CATEGORIES.INVALID_RESPONSE:
      return t("personalizedCatalogFallback.failures.invalidResponse")
    case MODEL_CATALOG_FAILURE_CATEGORIES.RATE_LIMIT:
      return t("personalizedCatalogFallback.failures.rateLimit")
    case MODEL_CATALOG_FAILURE_CATEGORIES.NETWORK:
      return t("personalizedCatalogFallback.failures.network")
    case MODEL_CATALOG_FAILURE_CATEGORIES.CANCELLATION:
      return t("personalizedCatalogFallback.failures.cancellation")
    default:
      return t("personalizedCatalogFallback.failures.upstream")
  }
}
