import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
} from "./contracts"

type ErrorMessageInput = {
  message?: unknown
}

const MAX_LOCAL_ERROR_MESSAGE_LENGTH = 500

/**
 * Checks for an object that may expose an Error-like message.
 */
function isErrorMessageInput(error: unknown): error is ErrorMessageInput {
  return typeof error === "object" && error !== null
}

/**
 * Reads a bounded lowercase copy of local-only error text.
 */
function getBoundedLocalMessage(error: unknown) {
  if (!isErrorMessageInput(error) || typeof error.message !== "string") {
    return undefined
  }

  return error.message
    .slice(0, MAX_LOCAL_ERROR_MESSAGE_LENGTH)
    .toLocaleLowerCase()
}

/**
 * Locally classifies known browser/backend text patterns into fixed enums.
 * The bounded raw message never leaves this module.
 */
export function resolveProductAnalyticsFailureReasonFromLocalMessage(
  error: unknown,
): ProductAnalyticsFailureReason | undefined {
  const message = getBoundedLocalMessage(error)
  if (!message) return undefined

  if (message.includes("failed to fetch")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable
  }
  if (message.includes("invalid api key") || message.includes("unauthorized")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid
  }
  if (message.includes("session expired")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired
  }
  if (message.includes("too many requests")) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited
  }
  if (
    message.includes("insufficient balance") ||
    message.includes("insufficient quota") ||
    message.includes("quota exceeded")
  ) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.QuotaInsufficient
  }
  if (
    message.includes("unexpected token") ||
    message.includes("json parse") ||
    message.includes("invalid json")
  ) {
    return PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson
  }

  return undefined
}

/**
 * Maps fixed failure reasons to the coarse analytics error taxonomy.
 */
export function resolveProductAnalyticsCategoryFromFailureReason(
  reason: ProductAnalyticsFailureReason,
): ProductAnalyticsErrorCategory | undefined {
  switch (reason) {
    case PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.TokenSecretUnavailable:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
    case PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.ServerError:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
    case PRODUCT_ANALYTICS_FAILURE_REASONS.RateLimited:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit
    case PRODUCT_ANALYTICS_FAILURE_REASONS.Timeout:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
    case PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionUnavailable:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.IncognitoBlocked:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission
    case PRODUCT_ANALYTICS_FAILURE_REASONS.UnsupportedTarget:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
    case PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidJson:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.ContentTypeMismatch:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.EmptyResponse:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingCredentials:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingSelection:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.MissingConfig:
    case PRODUCT_ANALYTICS_FAILURE_REASONS.QuotaInsufficient:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    default:
      return undefined
  }
}
