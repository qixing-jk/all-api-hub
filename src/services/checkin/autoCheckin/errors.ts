import { CHECK_IN_METHOD_UNKNOWN_REASON_CODES } from "~/constants/checkIn"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import type { CheckInMethodUnknownReason } from "~/types/checkIn"

export const AUTO_CHECKIN_ERROR_CATEGORIES = {
  AuthenticationRequired: "authentication_required",
  Network: "network",
  PermissionDenied: "permission_denied",
  SourceUnavailable: "source_unavailable",
  Timeout: "timeout",
  Unknown: "unknown",
} as const

type AutoCheckinErrorCategory =
  (typeof AUTO_CHECKIN_ERROR_CATEGORIES)[keyof typeof AUTO_CHECKIN_ERROR_CATEGORIES]

const NETWORK_ERROR_MESSAGE_PATTERN =
  /failed to fetch|fetch failed|network|offline|socket|connection|dns/i
const NETWORK_ERROR_CODES = new Set<string>([
  API_ERROR_CODES.NETWORK_ERROR,
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
])

const getNumericProperty = (error: object, property: string) => {
  const value = (error as Record<string, unknown>)[property]
  return typeof value === "number" ? value : undefined
}

const getStringProperty = (error: object, property: string) => {
  const value = (error as Record<string, unknown>)[property]
  return typeof value === "string" ? value : undefined
}

/** Classifies only errors with transport-level evidence as network failures. */
export function classifyAutoCheckinError(
  error: unknown,
): AutoCheckinErrorCategory {
  if (!(error instanceof Error) || error.name === "AbortError") {
    return AUTO_CHECKIN_ERROR_CATEGORIES.Unknown
  }

  const statusCode = getNumericProperty(error, "statusCode")
  if (statusCode === 401) {
    return AUTO_CHECKIN_ERROR_CATEGORIES.AuthenticationRequired
  }
  if (statusCode === 403) {
    return AUTO_CHECKIN_ERROR_CATEGORIES.PermissionDenied
  }
  if (statusCode === 408 || statusCode === 504) {
    return AUTO_CHECKIN_ERROR_CATEGORIES.Timeout
  }
  if (statusCode && statusCode >= 500) {
    return AUTO_CHECKIN_ERROR_CATEGORIES.SourceUnavailable
  }

  const code = getStringProperty(error, "code")
  if (error.name === "TimeoutError" || code === "ETIMEDOUT") {
    return AUTO_CHECKIN_ERROR_CATEGORIES.Timeout
  }
  if (
    (code && NETWORK_ERROR_CODES.has(code)) ||
    ((error instanceof TypeError || error.name === "NetworkError") &&
      NETWORK_ERROR_MESSAGE_PATTERN.test(error.message))
  ) {
    return AUTO_CHECKIN_ERROR_CATEGORIES.Network
  }

  return AUTO_CHECKIN_ERROR_CATEGORIES.Unknown
}

/** Maps runtime errors to persisted read-only discovery evidence. */
export function getCheckInMethodUnknownReason(
  error: unknown,
): CheckInMethodUnknownReason {
  switch (classifyAutoCheckinError(error)) {
    case AUTO_CHECKIN_ERROR_CATEGORIES.AuthenticationRequired:
      return CHECK_IN_METHOD_UNKNOWN_REASON_CODES.AuthenticationRequired
    case AUTO_CHECKIN_ERROR_CATEGORIES.Network:
      return CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network
    case AUTO_CHECKIN_ERROR_CATEGORIES.PermissionDenied:
      return CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied
    case AUTO_CHECKIN_ERROR_CATEGORIES.SourceUnavailable:
      return CHECK_IN_METHOD_UNKNOWN_REASON_CODES.SourceUnavailable
    case AUTO_CHECKIN_ERROR_CATEGORIES.Timeout:
      return CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout
    default:
      return CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse
  }
}
