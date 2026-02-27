/**
 * Shared utilities and constants for auto check-in providers.
 *
 * Provider implementations should reuse these helpers to avoid duplicated
 * magic strings (message keys, message parsing heuristics) across backends.
 */

import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

import type { AutoCheckinProviderResult } from "./types"

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

/**
 * Resolve common provider error handling into a normalized result.
 *
 * Providers can supply a custom "already checked" detector when needed
 * (e.g. AnyRouter treats an empty message as already-checked in some flows).
 */
export function resolveProviderErrorResult(params: {
  error: any
  isAlreadyChecked?: (message: string) => boolean
}): AutoCheckinProviderResult {
  const errorMessage = params.error?.message || String(params.error)
  const isAlreadyCheckedDetector =
    params.isAlreadyChecked ?? isAlreadyCheckedMessage

  if (errorMessage && isAlreadyCheckedDetector(errorMessage)) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      rawMessage: errorMessage,
    }
  }

  if (params.error?.statusCode === 404 || errorMessage.includes("404")) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.endpointNotSupported,
    }
  }

  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    rawMessage: errorMessage || undefined,
    messageKey: errorMessage
      ? undefined
      : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
  }
}
