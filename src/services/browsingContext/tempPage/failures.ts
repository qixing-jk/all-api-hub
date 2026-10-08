import {
  API_ERROR_CODES,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/contracts"
import {
  recordShieldBypassTempWindowFetchResult,
  recordShieldBypassTempWindowTurnstileFetchResult,
} from "~/services/productAnalytics/facts/shieldBypassSummary"
import {
  type AuthorizedTempContextOutcome,
  type PROTECTION_BYPASS_DECISION_RESULTS,
} from "~/services/protectionBypass/contracts"
import { getProtectionBypassDecisionErrorCode } from "~/services/protectionBypass/decisionErrorCode"
import { type ProtectionBypassPolicyDecision } from "~/services/protectionBypass/policy"
import {
  classifyRecoverableWindowCreationFailure,
  hasWindowsAPI,
  WINDOW_CREATION_FAILURE_REASONS,
  type WindowCreationFailureReason,
} from "~/utils/browser/windows"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import { type AuthorizeTempContextAtAcquire } from "./contracts"

type RecoverableWindowCreationError = Error & {
  reason: WindowCreationFailureReason
}

type UnsupportedTempContextError = Error & {
  code: ApiErrorCode
  reason: WindowCreationFailureReason
}

const TEMP_WINDOW_UNSUPPORTED_CODE_BY_REASON: Record<
  WindowCreationFailureReason,
  ApiErrorCode
> = {
  [WINDOW_CREATION_FAILURE_REASONS.WINDOWS_API_UNAVAILABLE]:
    API_ERROR_CODES.TEMP_WINDOW_WINDOWS_API_UNAVAILABLE,
  [WINDOW_CREATION_FAILURE_REASONS.WINDOW_CREATION_UNAVAILABLE]:
    API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
  [WINDOW_CREATION_FAILURE_REASONS.WINDOW_HANDLE_UNAVAILABLE]:
    API_ERROR_CODES.TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE,
}

/**
 * Wraps a recoverable window-creation failure with its normalized reason.
 */
export function createRecoverableWindowCreationError(
  reason: WindowCreationFailureReason,
  error?: unknown,
): RecoverableWindowCreationError {
  const message = error == null ? "" : getErrorMessage(error)
  const recoverableError = new Error(
    message || t("messages:background.windowCreationUnavailable"),
  ) as RecoverableWindowCreationError

  recoverableError.name = "RecoverableWindowCreationError"
  recoverableError.reason = reason

  return recoverableError
}

/**
 * Type guard for normalized recoverable window-creation failures.
 */
export function isRecoverableWindowCreationError(
  error: unknown,
): error is RecoverableWindowCreationError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "reason" in error &&
      typeof (error as { reason?: unknown }).reason === "string",
  )
}

/**
 * Builds the structured error returned when a window-only temp context cannot
 * fall back to a plain tab.
 */
export function createUnsupportedTempContextError(
  reason: WindowCreationFailureReason,
): UnsupportedTempContextError {
  const unsupportedError = new Error(
    t("messages:background.windowCreationUnavailable"),
  ) as UnsupportedTempContextError

  unsupportedError.name = "UnsupportedTempContextError"
  unsupportedError.code = TEMP_WINDOW_UNSUPPORTED_CODE_BY_REASON[reason]
  unsupportedError.reason = reason

  return unsupportedError
}

/**
 * Type guard for structured temp-context failures exposed to callers.
 */
function isUnsupportedTempContextError(
  error: unknown,
): error is UnsupportedTempContextError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      "reason" in error &&
      typeof (error as { reason?: unknown }).reason === "string",
  )
}

/**
 * Converts temp-context failures into the runtime response shape sent back to
 * higher-level callers.
 */
export function toTempWindowFailureResponse(error: unknown): {
  error: string
  code?: ApiErrorCode
  reason?: TempWindowAnalyticsFailureReason
} {
  if (isUnsupportedTempContextError(error)) {
    return {
      error: error.message,
      code: error.code,
    }
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    Object.values(API_ERROR_CODES).includes(
      (error as { code?: ApiErrorCode }).code as ApiErrorCode,
    )
  ) {
    return {
      error: getErrorMessage(error),
      code: (error as { code: ApiErrorCode }).code,
    }
  }

  return {
    error: getErrorMessage(error),
    ...(error instanceof Error &&
    error.message === TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR
      ? {
          reason:
            TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.TempWindowFetchNoResponse,
        }
      : {}),
  }
}

export const TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR =
  "No response from temp window fetch"

export const TEMP_WINDOW_ANALYTICS_FAILURE_REASONS = {
  IncognitoAccessRequired: "incognito_access_required",
  InvalidFetchRequest: "invalid_fetch_request",
  TempWindowFetchNoResponse: "temp_window_fetch_no_response",
  TurnstileTokenUnavailable: "turnstile_token_unavailable",
} as const

type TempWindowAnalyticsFailureReason =
  (typeof TEMP_WINDOW_ANALYTICS_FAILURE_REASONS)[keyof typeof TEMP_WINDOW_ANALYTICS_FAILURE_REASONS]

/** Converts a denied acquire-time decision into the public transport code. */
export function createProtectionBypassDecisionError(
  decision: Extract<
    ProtectionBypassPolicyDecision,
    { kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Denied }
  >,
) {
  const error = new Error(
    t("messages:background.tempWindowPolicyContextInvalid"),
  ) as Error & { code: ApiErrorCode }
  error.name = "ProtectionBypassPolicyError"
  error.code = getProtectionBypassDecisionErrorCode(decision)
  return error
}

/** Reports acquisition facts without letting observers change task outcomes. */
export function reportAuthorizedTempContextOutcome(
  authorizeAtAcquire: AuthorizeTempContextAtAcquire | undefined,
  outcome: AuthorizedTempContextOutcome,
) {
  try {
    authorizeAtAcquire?.reportOutcome?.(outcome)
  } catch {
    // Diagnostic observers are best effort and cannot change pool outcomes.
  }
}

/**
 * Converts temp-window response success into a fixed analytics result enum.
 */
export function getTempWindowAnalyticsResult(
  response: { success?: unknown } | undefined,
): ProductAnalyticsResult {
  return response?.success
    ? PRODUCT_ANALYTICS_RESULTS.Success
    : PRODUCT_ANALYTICS_RESULTS.Failure
}

/**
 * Maps structured temp-window failures to privacy-safe analytics categories.
 */
export function getTempWindowErrorCategory(input: {
  code?: ApiErrorCode
  status?: number
  reason?: TempWindowAnalyticsFailureReason
}): ProductAnalyticsErrorCategory {
  if (
    input.code === API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED ||
    input.reason ===
      TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.IncognitoAccessRequired
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission
  }

  if (
    input.code === API_ERROR_CODES.TEMP_WINDOW_DISABLED ||
    input.code === API_ERROR_CODES.FEATURE_UNSUPPORTED ||
    input.code === API_ERROR_CODES.TEMP_WINDOW_WINDOWS_API_UNAVAILABLE ||
    input.code === API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE ||
    input.code === API_ERROR_CODES.TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
  }

  if (input.code === API_ERROR_CODES.HTTP_401 || input.status === 401) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
  }

  if (input.code === API_ERROR_CODES.HTTP_429 || input.status === 429) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit
  }

  if (
    input.code === API_ERROR_CODES.HTTP_403 ||
    input.status === 403 ||
    (typeof input.status === "number" && input.status >= 500)
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
  }

  if (
    input.reason ===
    TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.TurnstileTokenUnavailable
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
  }

  if (
    input.code === API_ERROR_CODES.NETWORK_ERROR ||
    input.reason ===
      TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.TempWindowFetchNoResponse
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
  }

  if (
    input.reason === TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.InvalidFetchRequest
  ) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
  }

  return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
}

/**
 * Emits temp-window completion analytics without request URLs or response bodies.
 *
 * Outcomes are counted into the daily shield-bypass summary rather than emitted
 * per request: this path is the highest-volume action in the product, and the
 * summary already tracks the same counters per user per day.
 */
export function trackTempWindowFetchCompleted(input: {
  actionId: ProductAnalyticsActionId
  result: ProductAnalyticsResult
  errorCategory?: ProductAnalyticsErrorCategory
}) {
  if (input.actionId === PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowFetch) {
    void recordShieldBypassTempWindowFetchResult(
      input.result === PRODUCT_ANALYTICS_RESULTS.Success
        ? PRODUCT_ANALYTICS_RESULTS.Success
        : PRODUCT_ANALYTICS_RESULTS.Failure,
      input.errorCategory,
    )
    return
  }

  if (
    input.actionId === PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowTurnstileFetch
  ) {
    void recordShieldBypassTempWindowTurnstileFetchResult(
      input.result === PRODUCT_ANALYTICS_RESULTS.Success
        ? PRODUCT_ANALYTICS_RESULTS.Success
        : PRODUCT_ANALYTICS_RESULTS.Failure,
      input.errorCategory,
    )
  }
}

export const TURNSTILE_TOKEN_UNAVAILABLE_ERROR = "Turnstile token not available"

/**
 * Maps a low-level browser failure or missing handle into a recoverable
 * window-creation category when possible.
 */
export function classifyWindowCreationFailure(params: {
  error?: unknown
  missingHandle?: boolean
}): WindowCreationFailureReason | null {
  return classifyRecoverableWindowCreationFailure({
    error: params.error,
    windowsApiAvailable: hasWindowsAPI(),
    missingHandle: params.missingHandle,
  })
}
