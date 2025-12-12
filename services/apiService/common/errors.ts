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
  ROBOT_CHALLENGE: "ROBOT_CHALLENGE",
  JSON_PARSE_ERROR: "JSON_PARSE_ERROR",
  BUSINESS_ERROR: "BUSINESS_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN: "UNKNOWN",
} as const

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string,
    public code?: ApiErrorCode,
  ) {
    super(message)
    this.name = "ApiError"
  }

  /**
   * Preserves the original error code if this instance is re-labeled for UI messaging.
   * For example, we may convert HTTP_403 into TEMP_WINDOW_DISABLED when the request
   * could have been recovered via temp-window fallback but the feature was unavailable.
   */
  public originalCode?: ApiErrorCode
}
