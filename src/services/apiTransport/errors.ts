import { TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"

// ============= 错误处理 =============
export const API_ERROR_CODES = {
  HTTP_401: "HTTP_401",
  HTTP_403: "HTTP_403",
  HTTP_429: "HTTP_429",
  HTTP_OTHER: "HTTP_OTHER",
  CONTENT_TYPE_MISMATCH: "CONTENT_TYPE_MISMATCH",
  TEMP_WINDOW_DISABLED: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
  TEMP_WINDOW_PERMISSION_REQUIRED:
    TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
  TEMP_WINDOW_POLICY_CONTEXT_INVALID:
    TEMP_WINDOW_HEALTH_STATUS_CODES.POLICY_CONTEXT_INVALID,
  TEMP_WINDOW_WINDOWS_API_UNAVAILABLE: "TEMP_WINDOW_WINDOWS_API_UNAVAILABLE",
  TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE:
    "TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE",
  TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE:
    "TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE",
  ROBOT_CHALLENGE: "ROBOT_CHALLENGE",
  JSON_PARSE_ERROR: "JSON_PARSE_ERROR",
  BUSINESS_ERROR: "BUSINESS_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  TOKEN_SECRET_UNAVAILABLE: "TOKEN_SECRET_UNAVAILABLE",
  ACCOUNT_IDENTITY_MISMATCH: "ACCOUNT_IDENTITY_MISMATCH",
  FEATURE_UNSUPPORTED: "FEATURE_UNSUPPORTED",
  UNKNOWN: "UNKNOWN",
} as const

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

const TEMP_WINDOW_UNSUPPORTED_ERROR_CODES = new Set<ApiErrorCode>([
  API_ERROR_CODES.TEMP_WINDOW_WINDOWS_API_UNAVAILABLE,
  API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
  API_ERROR_CODES.TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE,
])

/**
 * Returns whether an API error code represents a temp-context flow that
 * required browser window creation but could not obtain it.
 */
export function isTempWindowUnsupportedErrorCode(
  code?: ApiErrorCode | null,
): code is ApiErrorCode {
  return Boolean(code && TEMP_WINDOW_UNSUPPORTED_ERROR_CODES.has(code))
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string,
    public code?: ApiErrorCode,
    public upstreamCode?: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "ApiError"

    if (cause instanceof ApiError) {
      this.statusCode ??= cause.statusCode
      this.endpoint ??= cause.endpoint
      this.code ??= cause.code
      this.upstreamCode ??= cause.upstreamCode
      this.unattributedMessage ??= cause.unattributedMessage
    }
  }

  /**
   * Preserves the original error code if this instance is re-labeled for UI messaging.
   * For example, we may convert HTTP_403 into TEMP_WINDOW_DISABLED when the request
   * could have been recovered via temp-window fallback but the feature was unavailable.
   */
  public originalCode?: ApiErrorCode

  /**
   * True when the message is not text the site sent: it was recovered from, or
   * replaced by, a body that is not the site's JSON answer (an interceptor page,
   * a proxy notice). It can still be the best copy to show, but no policy may
   * read it as the site claiming an authentication or permission problem.
   *
   * Unset means the site's own JSON answer or the raising caller supplied it.
   */
  public unattributedMessage?: boolean
}

/**
 * Returns whether an error's message cannot be attributed to the site.
 *
 * Reads the marker structurally: errors crossing a transport or message
 * boundary are not guaranteed to be `ApiError` instances.
 */
export function hasUnattributedMessage(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { unattributedMessage?: unknown }).unattributedMessage === true
  )
}
