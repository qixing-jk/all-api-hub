/**
 * Constants for the daily balance history feature.
 *
 * Keep these values in a dedicated module so they remain stable and easy to
 * reference across background/options contexts.
 */

export const DAILY_BALANCE_HISTORY_STORAGE_KEYS = {
  STORE: "dailyBalanceHistory_store",
} as const

/**
 * Alarm name used for the optional end-of-day capture run.
 */
export const DAILY_BALANCE_HISTORY_ALARM_NAME = "dailyBalanceHistoryCapture"

