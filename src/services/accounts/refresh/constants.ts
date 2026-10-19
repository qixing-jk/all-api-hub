/** Periodic saved-account refresh alarm shared by scheduling and lifecycle tests. */
export const ACCOUNT_AUTO_REFRESH_ALARM_NAME =
  "all-api-hub:account-auto-refresh"

/** Legacy broadcast protocol shared by the background service and account UI. */
export const AUTO_REFRESH_UPDATE_MESSAGE_TYPE = "AUTO_REFRESH_UPDATE"

export const AUTO_REFRESH_UPDATE_TYPES = {
  Completed: "refresh_completed",
  Error: "refresh_error",
} as const

export const ACCOUNT_REFRESH_SKIP_REASONS = {
  AccountDisabled: "account_disabled",
} as const
