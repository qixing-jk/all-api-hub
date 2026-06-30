import { API_ERROR_CODES } from "../apiService/common/errors"
import type { ProductAnalyticsActionDiagnostics } from "./actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
} from "./contracts"
import {
  resolveProductAnalyticsCategoryFromFailureReason,
  resolveProductAnalyticsFailureReasonFromLocalMessage,
} from "./errorPatternDiagnostics"

type StructuredDiagnosticsError = {
  statusCode?: unknown
  status?: unknown
  code?: unknown
  originalCode?: unknown
  name?: unknown
  cause?: unknown
}

type BuildActionFailureDiagnosticsOptions = {
  error?: unknown
  statusCode?: number
  errorCategory?: ProductAnalyticsErrorCategory
  stage?: ProductAnalyticsFailureStage
  reason?: ProductAnalyticsFailureReason
}

/**
 * Checks whether an error can expose structured diagnostic fields.
 */
function isStructuredDiagnosticsError(
  error: unknown,
): error is StructuredDiagnosticsError {
  return typeof error === "object" && error !== null
}

/**
 * Extracts a valid HTTP status code from a structured error.
 */
function getStatusCode(error: unknown) {
  if (!isStructuredDiagnosticsError(error)) return undefined
  const statusCode = error.statusCode ?? error.status
  return typeof statusCode === "number" &&
    Number.isInteger(statusCode) &&
    statusCode >= 100 &&
    statusCode <= 599
    ? statusCode
    : undefined
}

/**
 * Collects known structured error code fields.
 */
function getErrorCodes(error: unknown) {
  if (!isStructuredDiagnosticsError(error)) return []
  return [error.code, error.originalCode].filter(
    (value): value is string => typeof value === "string",
  )
}

/**
 * Checks a structured error name against allowed names.
 */
function hasErrorName(error: unknown, ...names: string[]) {
  return (
    isStructuredDiagnosticsError(error) && names.includes(String(error.name))
  )
}

/**
 * Maps HTTP status codes to sanitized failure reasons.
 */
function resolveReasonFromStatusCode(statusCode?: number) {
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
 * Maps internal API error codes to sanitized failure reasons.
 */
function resolveReasonFromCode(code: string) {
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
    case API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied
    case API_ERROR_CODES.TEMP_WINDOW_DISABLED:
    case API_ERROR_CODES.TEMP_WINDOW_WINDOWS_API_UNAVAILABLE:
    case API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE:
    case API_ERROR_CODES.TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE:
      return PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionUnavailable
    default:
      return undefined
  }
}

/**
 * Resolves a sanitized failure reason from structured error data.
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

  if (error instanceof SyntaxError || hasErrorName(error, "SyntaxError")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson
  }
  const messageReason =
    resolveProductAnalyticsFailureReasonFromLocalMessage(error)
  if (messageReason) return messageReason

  if (hasErrorName(error, "AbortError", "TimeoutError")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout
  }
  if (
    hasErrorName(
      error,
      "NotAllowedError",
      "SecurityError",
      "PermissionDeniedError",
    )
  ) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied
  }
  if (hasErrorName(error, "NotFoundError", "NotSupportedError")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget
  }
  if (hasErrorName(error, "NetworkError")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable
  }

  if (
    isStructuredDiagnosticsError(error) &&
    error.cause &&
    error.cause !== error
  ) {
    return resolveReasonFromError(error.cause, getStatusCode(error.cause))
  }

  return PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown
}

/**
 * Maps sanitized failure reasons to the affected action stage.
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
      return PRODUCT_ANALYTICS_FAILURE_STAGES.Response
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingCredentials:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingSelection:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingConfig:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.FeatureDisabled:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget:
      return PRODUCT_ANALYTICS_FAILURE_STAGES.Validation
    case PRODUCT_ANALYTICS_FAILURE_REASONS.StorageReadFailed:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.StorageWriteFailed:
      return PRODUCT_ANALYTICS_FAILURE_STAGES.Persist
    case PRODUCT_ANALYTICS_FAILURE_REASONS.CacheReadFailed:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.CacheWriteFailed:
      return PRODUCT_ANALYTICS_FAILURE_STAGES.Fallback
    default:
      return PRODUCT_ANALYTICS_FAILURE_STAGES.Request
  }
}

/**
 * Maps sanitized failure reasons to an analytics error category.
 */
function resolveCategoryFromReason(
  reason: ProductAnalyticsFailureReason,
  categoryInput: { statusCode?: number; error?: unknown },
) {
  switch (reason) {
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingCredentials:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingSelection:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingConfig:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.ContentTypeMismatch:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.EmptyResponse:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.QuotaInsufficient:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    case PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
    default:
      return (
        resolveProductAnalyticsCategoryFromFailureReason(reason) ??
        resolveCategoryFromStructuredInput(categoryInput)
      )
  }
}

/**
 * Maps HTTP status codes to sanitized analytics categories.
 */
function resolveCategoryFromStatusCode(statusCode: number) {
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
 * Maps internal API error codes to sanitized analytics categories.
 */
function resolveCategoryFromCode(code: string) {
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

/**
 * Resolves a sanitized analytics category from structured error input.
 */
function resolveCategoryFromStructuredInput({
  statusCode,
  error,
}: {
  statusCode?: number
  error?: unknown
}): ProductAnalyticsErrorCategory {
  if (typeof statusCode === "number") {
    const category = resolveCategoryFromStatusCode(statusCode)
    if (category) return category
  }

  for (const code of getErrorCodes(error)) {
    const category = resolveCategoryFromCode(code)
    if (category) return category
  }

  if (hasErrorName(error, "AbortError", "TimeoutError")) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
  }
  if (
    hasErrorName(
      error,
      "NotAllowedError",
      "SecurityError",
      "PermissionDeniedError",
    )
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission
  }
  if (hasErrorName(error, "NotFoundError", "NotSupportedError")) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
  }
  if (hasErrorName(error, "NetworkError")) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
  }
  const messageReason =
    resolveProductAnalyticsFailureReasonFromLocalMessage(error)
  if (messageReason) {
    return resolveCategoryFromReason(messageReason, { error })
  }

  if (
    isStructuredDiagnosticsError(error) &&
    error.cause &&
    error.cause !== error
  ) {
    return resolveCategoryFromStructuredInput({
      statusCode: getStatusCode(error.cause),
      error: error.cause,
    })
  }

  return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
}

/**
 * Builds privacy-safe failure diagnostics for feature actions.
 */
export function buildActionFailureDiagnostics({
  error,
  statusCode,
  errorCategory,
  stage,
  reason,
}: BuildActionFailureDiagnosticsOptions = {}): NonNullable<
  ProductAnalyticsActionDiagnostics["failure"]
> {
  const structuredStatusCode = statusCode ?? getStatusCode(error)
  const resolvedReason =
    reason ?? resolveReasonFromError(error, structuredStatusCode)
  return {
    category:
      errorCategory ??
      resolveCategoryFromReason(resolvedReason, {
        statusCode: structuredStatusCode,
        error,
      }),
    stage: stage ?? resolveStageFromReason(resolvedReason),
    reason: resolvedReason,
  }
}
