import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"

export const INVITE_LINK_FAILURE_REASONS = {
  FeatureDisabled: "feature_disabled",
  AuthenticationRequired: "authentication_required",
  ProviderRejected: "provider_rejected",
  Unavailable: "unavailable",
  InviteDataMissing: "invite_data_missing",
  InvalidResponse: "invalid_response",
  Network: "network",
  Timeout: "timeout",
  RateLimited: "rate_limited",
  Unknown: "unknown",
} as const

export type InviteLinkFailureReason =
  (typeof INVITE_LINK_FAILURE_REASONS)[keyof typeof INVITE_LINK_FAILURE_REASONS]

export type InviteLinkFailureReasonCounts = Partial<
  Record<InviteLinkFailureReason, number>
>

/** Carries a controlled invite-link failure reason without exposing provider text. */
export class InviteLinkError extends Error {
  constructor(
    public readonly reason: InviteLinkFailureReason,
    public readonly cause?: unknown,
  ) {
    super(reason)
    this.name = "InviteLinkError"
  }
}

const AUTH_ERROR_CODES = new Set<ApiErrorCode>([
  API_ERROR_CODES.HTTP_401,
  API_ERROR_CODES.HTTP_403,
  API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
])

const INVALID_RESPONSE_ERROR_CODES = new Set<ApiErrorCode>([
  API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
  API_ERROR_CODES.JSON_PARSE_ERROR,
])

const UNAVAILABLE_ERROR_CODES = new Set<ApiErrorCode>([
  API_ERROR_CODES.FEATURE_UNSUPPORTED,
  API_ERROR_CODES.TEMP_WINDOW_DISABLED,
  API_ERROR_CODES.TEMP_WINDOW_WINDOWS_API_UNAVAILABLE,
  API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
  API_ERROR_CODES.TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE,
])

const getApiErrorCodeReason = (
  code: ApiErrorCode | undefined,
): InviteLinkFailureReason | undefined => {
  if (code && AUTH_ERROR_CODES.has(code)) {
    return INVITE_LINK_FAILURE_REASONS.AuthenticationRequired
  }
  if (code === API_ERROR_CODES.HTTP_429) {
    return INVITE_LINK_FAILURE_REASONS.RateLimited
  }
  if (code === API_ERROR_CODES.NETWORK_ERROR) {
    return INVITE_LINK_FAILURE_REASONS.Network
  }
  if (code && UNAVAILABLE_ERROR_CODES.has(code)) {
    return INVITE_LINK_FAILURE_REASONS.Unavailable
  }
  if (code && INVALID_RESPONSE_ERROR_CODES.has(code)) {
    return INVITE_LINK_FAILURE_REASONS.InvalidResponse
  }
  if (code === API_ERROR_CODES.BUSINESS_ERROR) {
    return INVITE_LINK_FAILURE_REASONS.ProviderRejected
  }

  return undefined
}

const getApiErrorReason = (
  error: ApiError,
): InviteLinkFailureReason | undefined => {
  const structuredReason =
    getApiErrorCodeReason(error.code) ??
    getApiErrorCodeReason(error.originalCode)
  if (structuredReason) return structuredReason

  if (error.statusCode === 401 || error.statusCode === 403) {
    return INVITE_LINK_FAILURE_REASONS.AuthenticationRequired
  }
  if (error.statusCode === 408) {
    return INVITE_LINK_FAILURE_REASONS.Timeout
  }
  if (error.statusCode === 429) {
    return INVITE_LINK_FAILURE_REASONS.RateLimited
  }
  if (error.statusCode === 404 || error.statusCode === 405) {
    return INVITE_LINK_FAILURE_REASONS.Unavailable
  }
  if (typeof error.statusCode === "number" && error.statusCode >= 500) {
    return INVITE_LINK_FAILURE_REASONS.Network
  }

  return undefined
}

/** Normalizes provider and transport failures at the invite-link boundary. */
export function normalizeInviteLinkError(error: unknown): InviteLinkError {
  if (error instanceof InviteLinkError) return error

  if (error instanceof ApiError) {
    const reason = getApiErrorReason(error)
    if (reason) return new InviteLinkError(reason, error)
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new InviteLinkError(INVITE_LINK_FAILURE_REASONS.Timeout, error)
    }
    if (error instanceof TypeError || error.name === "NetworkError") {
      return new InviteLinkError(INVITE_LINK_FAILURE_REASONS.Network, error)
    }

    const nestedCause = (error as Error & { cause?: unknown }).cause
    if (nestedCause && nestedCause !== error) {
      return new InviteLinkError(
        normalizeInviteLinkError(nestedCause).reason,
        error,
      )
    }
  }

  return new InviteLinkError(INVITE_LINK_FAILURE_REASONS.Unknown, error)
}
