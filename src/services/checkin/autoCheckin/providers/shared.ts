/**
 * Shared utilities and constants for auto check-in providers.
 *
 * Provider implementations should reuse these helpers to avoid duplicated
 * magic strings (message keys, message parsing heuristics) across backends.
 */

import {
  API_ERROR_CODES,
  hasUnattributedMessage,
} from "~/services/apiTransport/errors"
import {
  AUTO_CHECKIN_ERROR_CATEGORIES,
  classifyAutoCheckinError,
} from "~/services/checkin/autoCheckin/errors"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"

export const AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS = {
  alreadyCheckedToday: "autoCheckin:providerFallback.alreadyCheckedToday",
  checkinSuccessful: "autoCheckin:providerFallback.checkinSuccessful",
  checkinFailed: "autoCheckin:providerFallback.checkinFailed",
  checkinDisabled: "autoCheckin:providerWong.checkinDisabled",
  sessionBusy: "autoCheckin:providerFallback.sessionBusy",
  /** A login-based provider was selected but its browser login method is unset. */
  loginProviderRequired: "autoCheckin:providerFallback.loginProviderRequired",
  endpointNotSupported: "autoCheckin:providerFallback.endpointNotSupported",
  unknownError: "autoCheckin:providerFallback.unknownError",
} as const

/**
 * Builds the retryable upstream failure shared by message-only check-in
 * backends. Backend copy wins when present; the localized generic failure is
 * the fallback.
 */
export function createUpstreamFailureResult(params: {
  rawMessage?: string
  data?: unknown
}): AutoCheckinProviderResult {
  const rawMessage = params.rawMessage || undefined
  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
    rawMessage,
    messageKey: rawMessage
      ? undefined
      : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
    data: params.data ?? undefined,
    retryable: true,
  }
}

/**
 * Common daily check-in endpoint used by many One-API/New-API family deployments.
 */
export const AUTO_CHECKIN_USER_CHECKIN_ENDPOINT = "/api/user/checkin" as const

const DEFAULT_ALREADY_CHECKED_MESSAGE_SNIPPETS = [
  "今天已经签到",
  "已经签到",
  "已签到",
  "already",
] as const

/**
 * Normalize unknown message payloads to a string.
 */
export function normalizeCheckinMessage(message: unknown): string {
  return typeof message === "string" ? message : ""
}

/**
 * Determine whether a message indicates the user has already checked in today.
 *
 * Note: Providers with different semantics should implement their own detector.
 */
export function isAlreadyCheckedMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return DEFAULT_ALREADY_CHECKED_MESSAGE_SNIPPETS.some((snippet) =>
    normalized.includes(snippet.toLowerCase()),
  )
}

/** Clear login-failure copy. A bare HTTP status is not enough. */
function isAuthenticationFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  const invalidAccessToken =
    normalized.includes("access token") &&
    ["无效", "失效", "过期", "invalid", "expired"].some((hint) =>
      normalized.includes(hint),
    )
  return (
    invalidAccessToken ||
    normalized.includes("unauthorized") ||
    normalized.includes("unauthenticated") ||
    normalized.includes("authentication") ||
    normalized.includes("authenticate") ||
    normalized.includes("auth required") ||
    normalized.includes("invalid auth") ||
    normalized.includes("not logged") ||
    normalized.includes("login required") ||
    message.includes("未登录")
  )
}

/** Clear permission-failure copy. A bare HTTP 403 is not enough. */
export function isPermissionFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    message.includes("无权限") ||
    message.includes("权限")
  )
}

/** Clear method-disabled copy. A bare HTTP status is not enough. */
function isMethodDisabledMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("checkin disabled") ||
    normalized.includes("check-in disabled") ||
    normalized.includes("checkin is disabled") ||
    normalized.includes("check-in is disabled") ||
    normalized.includes("checkin closed") ||
    normalized.includes("check-in closed") ||
    normalized.includes("check-in unavailable") ||
    normalized.includes("checkin unavailable") ||
    message.includes("签到已关闭") ||
    message.includes("签到未开放") ||
    message.includes("暂未开放签到") ||
    message.includes("未开启签到") ||
    message.includes("签到功能已停用") ||
    message.includes("签到功能已关闭")
  )
}

/**
 * Detects whether a message is an unambiguous terminal failure reason
 * (authentication required, permission denied, or method disabled).
 */
export function matchTerminalFailureReason(
  message: string,
): AutoCheckinSkipReason | null {
  if (isAuthenticationFailureMessage(message)) {
    return AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED
  }
  if (isPermissionFailureMessage(message)) {
    return AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED
  }
  if (isMethodDisabledMessage(message)) {
    return AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED
  }
  return null
}

/**
 * Creates a terminal failure result with standard error translation key and non-retryable status.
 */
export function createTerminalFailureResult(params: {
  reasonCode: AutoCheckinSkipReason
  rawMessage?: string
  data?: unknown
}): AutoCheckinProviderResult {
  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    messageKey: getAutoCheckinSkipReasonTranslationKey(params.reasonCode),
    reasonCode: params.reasonCode,
    rawMessage: params.rawMessage || undefined,
    retryable: false,
    ...(params.data !== undefined ? { data: params.data } : {}),
  }
}

/** Platform-level failures that already have a user-facing remedy. */
const PLATFORM_FAILURE_REASON_CODES: Record<string, AutoCheckinSkipReason> = {
  [API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID]:
    AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID,
}

const getPlatformFailureReasonCode = (
  error: unknown,
): AutoCheckinSkipReason | undefined => {
  if (!(error instanceof Error)) return undefined

  const code = (error as { code?: unknown }).code
  return typeof code === "string"
    ? PLATFORM_FAILURE_REASON_CODES[code]
    : undefined
}

const getFailureReasonCode = (
  errorCategory: ReturnType<typeof classifyAutoCheckinError>,
): AutoCheckinSkipReason | undefined => {
  switch (errorCategory) {
    case AUTO_CHECKIN_ERROR_CATEGORIES.AuthenticationRequired:
      return AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED
    case AUTO_CHECKIN_ERROR_CATEGORIES.PermissionDenied:
      return AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED
    case AUTO_CHECKIN_ERROR_CATEGORIES.Network:
      return AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR
    case AUTO_CHECKIN_ERROR_CATEGORIES.Timeout:
      return AUTO_CHECKIN_SKIP_REASON.TIMEOUT
    case AUTO_CHECKIN_ERROR_CATEGORIES.SourceUnavailable:
      return AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE
    default:
      return undefined
  }
}

/**
 * Resolve common provider error handling into a normalized result.
 *
 * Providers can supply a custom "already checked" detector when needed.
 */
export function resolveProviderErrorResult(params: {
  error: unknown
  isAlreadyChecked?: (message: string) => boolean
  /** The business mutation may have reached the remote handler. */
  mutationDispatched?: boolean
}): AutoCheckinProviderResult {
  const errorMessage = (() => {
    const error = params.error
    if (typeof error === "string") return error
    if (error instanceof Error) return error.message

    if (error && typeof error === "object") {
      const record = error as Record<string, unknown>
      if (typeof record.message === "string") return record.message
      try {
        const serialized = JSON.stringify(error)
        return serialized === "{}" ? String(error) : serialized
      } catch {
        return String(error)
      }
    }

    return String(error)
  })()
  const isAlreadyCheckedDetector =
    params.isAlreadyChecked ?? isAlreadyCheckedMessage
  // These three verdicts rest on what the site said. Text the transport
  // recovered from a body that is not the site's JSON answer is still worth
  // showing, but an interceptor page must not decide a dead end, so it only
  // reaches the status-based classification below.
  const verdictMessage = hasUnattributedMessage(params.error)
    ? ""
    : errorMessage

  if (verdictMessage && isAlreadyCheckedDetector(verdictMessage)) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      rawMessage: errorMessage,
    }
  }

  if (verdictMessage) {
    const terminalReason = matchTerminalFailureReason(verdictMessage)
    if (terminalReason) {
      return createTerminalFailureResult({
        reasonCode: terminalReason,
        rawMessage: errorMessage,
      })
    }
  }

  const statusCode = (() => {
    const error = params.error
    if (!error || typeof error !== "object") return null
    const record = error as Record<string, unknown>
    return typeof record.statusCode === "number" ? record.statusCode : null
  })()

  // The protected-context failure happens before the mutation is dispatched,
  // so it stays a plain failure the user can re-initiate.
  const platformReasonCode = getPlatformFailureReasonCode(params.error)
  if (platformReasonCode) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: getAutoCheckinSkipReasonTranslationKey(platformReasonCode),
      reasonCode: platformReasonCode,
    }
  }

  // Only structured transport status is protocol evidence. A backend message
  // can contain the digits "404" for unrelated business data.
  if (statusCode === 404 || statusCode === 405) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.endpointNotSupported,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
      retryable: false,
    }
  }

  const errorCode =
    params.error && typeof params.error === "object"
      ? (params.error as { code?: unknown }).code
      : undefined
  const isDeterminateRejection =
    errorCode === API_ERROR_CODES.BUSINESS_ERROR ||
    (typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 401 &&
      statusCode !== 403 &&
      statusCode !== 408)
  if (isDeterminateRejection) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
      rawMessage: errorMessage || undefined,
      messageKey: errorMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      retryable: true,
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
      rawMessage: errorMessage || undefined,
      messageKey: errorMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
      retryable: true,
    }
  }

  const normalizedReasonCode = getFailureReasonCode(
    classifyAutoCheckinError(params.error),
  )
  const mutationResultIsUncertain =
    params.mutationDispatched === true &&
    normalizedReasonCode !== AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED &&
    normalizedReasonCode !== AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED
  if (normalizedReasonCode) {
    return {
      status: mutationResultIsUncertain
        ? CHECKIN_RESULT_STATUS.UNCERTAIN
        : CHECKIN_RESULT_STATUS.FAILED,
      messageKey: getAutoCheckinSkipReasonTranslationKey(normalizedReasonCode),
      ...(statusCode ? { messageParams: { statusCode } } : {}),
      reasonCode: normalizedReasonCode,
    }
  }

  // Nothing matched a known transport or platform cause, so the failure stays
  // classifiable as a site-side error instead of landing in 未分类.
  return {
    status: mutationResultIsUncertain
      ? CHECKIN_RESULT_STATUS.UNCERTAIN
      : CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
    rawMessage: errorMessage || undefined,
    messageKey: errorMessage
      ? undefined
      : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
    ...(mutationResultIsUncertain ? {} : { retryable: true }),
  }
}

/**
 * Determine the effective authentication type for an account
 * @param account Partial account object containing at least `authType`.
 */
export function getEffectiveAuthType(account: Pick<SiteAccount, "authType">) {
  return account.authType ?? AuthTypeEnum.AccessToken
}
