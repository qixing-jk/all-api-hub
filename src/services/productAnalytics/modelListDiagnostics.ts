import { API_ERROR_CODES } from "../apiTransport/errors"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  type ProductAnalyticsActionDiagnostics,
} from "./actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  type ProductAnalyticsApiType,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
  type ProductAnalyticsRequestedAuthMode,
  type ProductAnalyticsSiteType,
  type ProductAnalyticsSourceKind,
} from "./contracts"
import {
  resolveProductAnalyticsCategoryFromFailureReason,
  resolveProductAnalyticsFailureReasonFromLocalMessage,
} from "./errorPatternDiagnostics"

type StructuredModelListError = {
  statusCode?: unknown
  status?: unknown
  code?: unknown
  originalCode?: unknown
  name?: unknown
  cause?: unknown
}

type BuildModelListFailureDiagnosticsOptions = {
  error?: unknown
  statusCode?: number
  errorCategory?: ProductAnalyticsErrorCategory
  stage?: ProductAnalyticsFailureStage
  reason?: ProductAnalyticsFailureReason
}

type BuildModelListDiagnosticsOptions =
  BuildModelListFailureDiagnosticsOptions & {
    sourceKind: ProductAnalyticsSourceKind
    apiType?: ProductAnalyticsApiType
    siteType?: ProductAnalyticsSiteType
    requestedAuthMode?: ProductAnalyticsRequestedAuthMode
    cacheHit?: boolean
    cacheUsed?: boolean
    fallbackAvailable?: boolean
    fallbackUsed?: boolean
    retryAttempted?: boolean
    retryCount?: number
    staleResponseIgnored?: boolean
    modelCount?: number
    successCount?: number
    failureCount?: number
    skippedCount?: number
    resultKind?: "stale_response_ignored" | "missing_credentials"
  }

/**
 * Checks whether an error can expose structured model-list fields.
 */
function isStructuredModelListError(
  error: unknown,
): error is StructuredModelListError {
  return typeof error === "object" && error !== null
}

/**
 * Extracts a valid HTTP status code from a model-list error.
 */
function getStatusCode(error: unknown) {
  if (!isStructuredModelListError(error)) return undefined
  const statusCode = error.statusCode ?? error.status
  return typeof statusCode === "number" &&
    Number.isInteger(statusCode) &&
    statusCode >= 100 &&
    statusCode <= 599
    ? statusCode
    : undefined
}

/**
 * Collects known model-list error code fields.
 */
function getErrorCodes(error: unknown) {
  if (!isStructuredModelListError(error)) return []
  return [error.code, error.originalCode].filter(
    (value): value is string => typeof value === "string",
  )
}

/**
 * Checks a structured model-list error name against allowed names.
 */
function hasErrorName(error: unknown, ...names: string[]) {
  return isStructuredModelListError(error) && names.includes(String(error.name))
}

/**
 * Checks whether an error represents JSON syntax failure.
 */
function isSyntaxError(error: unknown) {
  return error instanceof SyntaxError || hasErrorName(error, "SyntaxError")
}

/**
 * Checks whether a code represents an invalid model response shape.
 */
function isInvalidResponseShapeCode(code: string) {
  return (
    code === "INVALID_MODEL_PRICING_FORMAT" ||
    code === "INVALID_FORMAT" ||
    code === API_ERROR_CODES.CONTENT_TYPE_MISMATCH
  )
}

/**
 * Maps HTTP status codes to sanitized model-list failure reasons.
 */
function resolveReasonFromStatusCode(
  statusCode?: number,
): ProductAnalyticsFailureReason | undefined {
  if (statusCode === 401 || statusCode === 403) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid
  }
  if (statusCode === 408) return PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout
  if (statusCode === 429) return PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited
  if (typeof statusCode === "number" && statusCode >= 500) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.ServerError
  }
  return undefined
}

/**
 * Maps error codes to sanitized model-list failure reasons.
 */
function resolveReasonFromCode(
  code: string,
): ProductAnalyticsFailureReason | undefined {
  switch (code) {
    case API_ERROR_CODES.HTTP_401:
    case API_ERROR_CODES.HTTP_403:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid
    case API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.TokenSecretUnavailable
    case API_ERROR_CODES.HTTP_429:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited
    case API_ERROR_CODES.NETWORK_ERROR:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable
    case API_ERROR_CODES.BUSINESS_ERROR:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.ProviderBusinessError
    case API_ERROR_CODES.JSON_PARSE_ERROR:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson
    case API_ERROR_CODES.CONTENT_TYPE_MISMATCH:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.ContentTypeMismatch
    case API_ERROR_CODES.FEATURE_UNSUPPORTED:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget
    default:
      return isInvalidResponseShapeCode(code)
        ? PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape
        : undefined
  }
}

/**
 * Resolves a sanitized model-list failure reason from structured input.
 */
function resolveReasonFromError(
  error: unknown,
  statusCode?: number,
): ProductAnalyticsFailureReason {
  const statusReason = resolveReasonFromStatusCode(statusCode)
  if (statusReason) return statusReason

  for (const code of getErrorCodes(error)) {
    const codeReason = resolveReasonFromCode(code)
    if (codeReason) return codeReason
  }

  if (isSyntaxError(error)) return PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson
  const messageReason =
    resolveProductAnalyticsFailureReasonFromLocalMessage(error)
  if (messageReason) return messageReason

  if (hasErrorName(error, "AbortError", "TimeoutError")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout
  }
  if (hasErrorName(error, "NetworkError")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable
  }

  if (
    isStructuredModelListError(error) &&
    error.cause &&
    error.cause !== error
  ) {
    return resolveReasonFromError(error.cause, getStatusCode(error.cause))
  }

  return PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown
}

/**
 * Maps sanitized model-list failure reasons to action stages.
 */
function resolveStageFromReason(
  reason: ProductAnalyticsFailureReason,
): ProductAnalyticsFailureStage {
  switch (reason) {
    case PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson:
      return PRODUCT_ANALYTICS_FAILURE_STAGES.Parse
    case PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.ContentTypeMismatch:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.EmptyResponse:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingCredentials:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingConfig:
      return PRODUCT_ANALYTICS_FAILURE_STAGES.Validation
    default:
      return PRODUCT_ANALYTICS_FAILURE_STAGES.Execute
  }
}

/**
 * Normalizes response-validation failures to the parse stage.
 */
function normalizeValidationStage(
  reason: ProductAnalyticsFailureReason,
  stage: ProductAnalyticsFailureStage,
) {
  return reason === PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape ||
    reason === PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson
    ? PRODUCT_ANALYTICS_FAILURE_STAGES.Parse
    : stage
}

/**
 * Builds privacy-safe failure diagnostics for model-list loading.
 */
export function buildModelListFailureDiagnostics({
  error,
  statusCode,
  errorCategory,
  stage,
  reason,
}: BuildModelListFailureDiagnosticsOptions = {}): NonNullable<
  ProductAnalyticsActionDiagnostics["failure"]
> {
  const structuredStatusCode = statusCode ?? getStatusCode(error)
  const resolvedReason =
    reason ?? resolveReasonFromError(error, structuredStatusCode)
  const resolvedStage = normalizeValidationStage(
    resolvedReason,
    stage ?? resolveStageFromReason(resolvedReason),
  )
  const categoryInput =
    typeof structuredStatusCode === "number"
      ? { statusCode: structuredStatusCode }
      : error
  const resolvedCategory =
    errorCategory ??
    resolveProductAnalyticsCategoryFromFailureReason(resolvedReason) ??
    resolveProductAnalyticsErrorCategoryFromError(categoryInput)

  return {
    category: resolvedCategory,
    stage: resolvedStage,
    reason: resolvedReason,
  }
}

/**
 * Builds privacy-safe diagnostics for model-list loading.
 */
export function buildModelListDiagnostics({
  sourceKind,
  apiType,
  siteType,
  requestedAuthMode,
  cacheHit,
  cacheUsed,
  fallbackAvailable,
  fallbackUsed,
  retryAttempted,
  retryCount,
  staleResponseIgnored,
  modelCount,
  successCount,
  failureCount,
  skippedCount,
  resultKind,
  ...failureOptions
}: BuildModelListDiagnosticsOptions): ProductAnalyticsActionDiagnostics {
  const resolvedResultKind = resultKind
  const failure =
    resolvedResultKind === "stale_response_ignored"
      ? buildModelListFailureDiagnostics({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          reason: PRODUCT_ANALYTICS_FAILURE_REASONS.StaleResponseIgnored,
        })
      : resolvedResultKind === "missing_credentials"
        ? buildModelListFailureDiagnostics({
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.MissingCredentials,
          })
        : failureOptions.error ||
            failureOptions.errorCategory ||
            failureOptions.statusCode ||
            failureOptions.reason ||
            failureOptions.stage
          ? buildModelListFailureDiagnostics(failureOptions)
          : undefined

  return {
    context: {
      sourceKind,
      ...(apiType ? { apiType } : {}),
      ...(siteType ? { siteType } : {}),
      ...(requestedAuthMode ? { requestedAuthMode } : {}),
    },
    ...(typeof cacheHit === "boolean" ||
    typeof cacheUsed === "boolean" ||
    typeof fallbackAvailable === "boolean" ||
    typeof fallbackUsed === "boolean" ||
    typeof retryAttempted === "boolean" ||
    typeof retryCount === "number" ||
    typeof staleResponseIgnored === "boolean" ||
    resolvedResultKind === "stale_response_ignored"
      ? {
          execution: {
            ...(typeof cacheHit === "boolean" ? { cacheHit } : {}),
            ...(typeof cacheUsed === "boolean" ? { cacheUsed } : {}),
            ...(typeof fallbackAvailable === "boolean"
              ? { fallbackAvailable }
              : {}),
            ...(typeof fallbackUsed === "boolean" ? { fallbackUsed } : {}),
            ...(typeof retryAttempted === "boolean" ? { retryAttempted } : {}),
            ...(typeof retryCount === "number" ? { retryCount } : {}),
            ...(typeof staleResponseIgnored === "boolean"
              ? { staleResponseIgnored }
              : resolvedResultKind === "stale_response_ignored"
                ? { staleResponseIgnored: true }
                : {}),
          },
        }
      : {}),
    ...(typeof modelCount === "number" ||
    typeof successCount === "number" ||
    typeof failureCount === "number" ||
    typeof skippedCount === "number" ||
    resolvedResultKind === "stale_response_ignored"
      ? {
          outcome: {
            ...(typeof modelCount === "number" ? { modelCount } : {}),
            ...(typeof successCount === "number" ? { successCount } : {}),
            ...(typeof failureCount === "number" ? { failureCount } : {}),
            ...(typeof skippedCount === "number"
              ? { skippedCount }
              : resolvedResultKind === "stale_response_ignored"
                ? { skippedCount: 1 }
                : {}),
          },
        }
      : {}),
    ...(failure ? { failure } : {}),
  }
}
