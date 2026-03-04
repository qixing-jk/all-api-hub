/**
 * Machine-readable health status codes related to temp-window fallback.
 *
 * These codes are used to drive actionable UI (e.g., deep-link to Settings).
 */
export const TEMP_WINDOW_HEALTH_STATUS_CODES = {
  DISABLED: "TEMP_WINDOW_DISABLED",
  PERMISSION_REQUIRED: "TEMP_WINDOW_PERMISSION_REQUIRED",
} as const

export type TempWindowHealthStatusCode =
  (typeof TEMP_WINDOW_HEALTH_STATUS_CODES)[keyof typeof TEMP_WINDOW_HEALTH_STATUS_CODES]
