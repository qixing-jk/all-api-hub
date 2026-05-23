/**
 * Daily balance history types.
 *
 * This feature stores privacy-safe per-day snapshots derived from account refresh
 * results (quota + optional today cashflow values).
 *
 * Snapshots are keyed by local calendar day (`YYYY-MM-DD`) and account id.
 */

export const DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION = 1 as const

/**
 * Capture trigger/source for a stored snapshot.
 */
export type DailyBalanceHistoryCaptureSource = "refresh" | "alarm"

/**
 * Persisted per-day snapshot payload.
 *
 * Notes:
 * - `today_income` and `today_quota_consumption` are nullable so we can represent
 *   "not fetched" when `showTodayCashflow` is disabled (refresh-driven capture).
 */
export interface DailyBalanceSnapshot {
  quota: number
  today_income: number | null
  today_quota_consumption: number | null
  capturedAt: number
  source: DailyBalanceHistoryCaptureSource
}

/**
 * Daily balance history store payload.
 *
 * Shape:
 * - accountId -> dayKey -> snapshot
 */
export interface DailyBalanceHistoryStore {
  schemaVersion: typeof DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION
  snapshotsByAccountId: Record<string, Record<string, DailyBalanceSnapshot>>
}

export const TODAY_INCOME_ESTIMATE_STATUS = {
  available: "available",
  disabled: "disabled",
  missingCurrentSnapshot: "missing_current_snapshot",
  missingBaseline: "missing_baseline",
  missingCashflow: "missing_cashflow",
  manualBalance: "manual_balance",
  invalidEstimate: "invalid_estimate",
} as const

export type TodayIncomeEstimateStatus =
  (typeof TODAY_INCOME_ESTIMATE_STATUS)[keyof typeof TODAY_INCOME_ESTIMATE_STATUS]

export interface TodayIncomeEstimateResult {
  reportedTodayIncome: number | null
  estimatedTodayIncome: number | null
  compensation: number | null
  status: TodayIncomeEstimateStatus
}

export interface BalanceHistoryEndOfDayCapturePreferences {
  enabled: boolean
}

export interface BalanceHistoryEstimatedTodayIncomePreferences {
  enabled: boolean
}

/**
 * User preferences controlling daily balance history capture and retention.
 *
 * Notes:
 * - Feature is opt-in via `enabled` (default disabled).
 * - End-of-day capture is a separate opt-in as it triggers background alarms.
 */
export interface BalanceHistoryPreferences {
  enabled: boolean
  endOfDayCapture: BalanceHistoryEndOfDayCapturePreferences
  estimatedTodayIncome: BalanceHistoryEstimatedTodayIncomePreferences
  retentionDays: number
}

export const DEFAULT_BALANCE_HISTORY_PREFERENCES: BalanceHistoryPreferences = {
  enabled: false,
  endOfDayCapture: { enabled: false },
  estimatedTodayIncome: { enabled: false },
  retentionDays: 365,
}
