/**
 * Shared utilities and constants for auto check-in providers.
 *
 * Provider implementations should reuse these helpers to avoid duplicated
 * magic strings (message keys, message parsing heuristics) across backends.
 */

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
  endpointNotSupported: "autoCheckin:providerFallback.endpointNotSupported",
  unknownError: "autoCheckin:providerFallback.unknownError",
} as const

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

  if (errorMessage && isAlreadyCheckedDetector(errorMessage)) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      rawMessage: errorMessage,
    }
  }

  const statusCode = (() => {
    const error = params.error
    if (!error || typeof error !== "object") return null
    const record = error as Record<string, unknown>
    return typeof record.statusCode === "number" ? record.statusCode : null
  })()

  // Only structured transport status is protocol evidence. A backend message
  // can contain the digits "404" for unrelated business data.
  if (statusCode === 404) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.endpointNotSupported,
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

  return {
    status: mutationResultIsUncertain
      ? CHECKIN_RESULT_STATUS.UNCERTAIN
      : CHECKIN_RESULT_STATUS.FAILED,
    rawMessage: errorMessage || undefined,
    messageKey: errorMessage
      ? undefined
      : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
  }
}

/**
 * Determine the effective authentication type for an account
 * @param account Partial account object containing at least `authType`.
 */
export function getEffectiveAuthType(account: Pick<SiteAccount, "authType">) {
  return account.authType ?? AuthTypeEnum.AccessToken
}
