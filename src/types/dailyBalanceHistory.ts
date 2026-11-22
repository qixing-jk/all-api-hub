/**
 * Daily balance history types.
 *
 * Native snapshots preserve asset, scope, interval and observation time.
 * Referenced historical amounts retain their original local day and account.
 */

import type { AccountAllowanceSnapshot } from "~/services/accounts/allowances"
import type {
  BalancePosition,
  BalanceSnapshot,
} from "~/services/amounts/balance"
import type { FinancialIncomeFact } from "~/services/amounts/income"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import type { AccountUsageSummary } from "~/types"

/** A provider day total with its date and original observation, independently of settlement. */
export type ReportedDayCost = NonNullable<AccountUsageSummary["cost"]> & {
  dayKey?: string
  scope: FinancialConsumptionFact["scope"]
}

export const DAILY_BALANCE_HISTORY_CAPTURE_SOURCES = {
  Refresh: "refresh",
  Alarm: "alarm",
} as const

export const DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION = 4 as const

/** Accepted observations preserve each amount's original clock and source. */
export interface FinancialHistorySnapshot {
  /** Monotonic account acceptance order; absent only on earlier or imported observations. */
  generation?: number
  balance?: BalanceSnapshot
  allowances?: AccountAllowanceSnapshot
  settledConsumption?: FinancialConsumptionFact[]
  reportedDayCosts?: ReportedDayCost[]
  reportedIncome?: FinancialIncomeFact[]
  source: DailyBalanceHistoryCaptureSource
  endedPositionKeys?: string[]
  endedAllowanceKeys?: string[]
}

/**
 * Capture trigger/source for a stored snapshot.
 */
export type DailyBalanceHistoryCaptureSource =
  (typeof DAILY_BALANCE_HISTORY_CAPTURE_SOURCES)[keyof typeof DAILY_BALANCE_HISTORY_CAPTURE_SOURCES]

/** USD equivalents from the archived daily snapshot, before display FX. */
export interface DailyBalanceReferenceSnapshot {
  balanceUsd: number
  incomeUsd: number | null
  consumptionUsd: number | null
  capturedAt: number
  source: DailyBalanceHistoryCaptureSource
}

export interface DailyBalanceHistoryStore {
  schemaVersion: typeof DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION
  referenceSnapshotsByAccountId: Record<
    string,
    Record<string, DailyBalanceReferenceSnapshot>
  >
  financialSnapshotsByAccountId?: Record<string, FinancialHistorySnapshot[]>
}

export const TODAY_INCOME_ESTIMATE_STATUS = {
  available: "available",
  disabled: "disabled",
  missingCurrentSnapshot: "missing_current_snapshot",
  missingBaseline: "missing_baseline",
  missingCashflow: "missing_cashflow",
  manualBalance: "manual_balance",
  invalidEstimate: "invalid_estimate",
  legacy: "legacy",
  intervalMismatch: "interval_mismatch",
  historyUnavailable: "history_unavailable",
} as const

export type TodayIncomeEstimateStatus =
  (typeof TODAY_INCOME_ESTIMATE_STATUS)[keyof typeof TODAY_INCOME_ESTIMATE_STATUS]

/** Every current ledger retains its own identity and missing-evidence state. */
export interface NetInflowEstimateItem {
  seriesKey: string
  position: BalancePosition
  status: TodayIncomeEstimateStatus
  netInflow?: import("~/services/history/dailyBalanceHistory/netInflow").NetInflowResult
}

export interface TodayIncomeEstimateResult {
  reportedTodayIncome: number | null
  estimatedTodayIncome: number | null
  compensation: number | null
  estimates: NetInflowEstimateItem[]
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
 * - Refresh-driven capture is enabled by default.
 * - End-of-day capture is a separate opt-in as it triggers background alarms.
 */
export interface BalanceHistoryPreferences {
  enabled: boolean
  endOfDayCapture: BalanceHistoryEndOfDayCapturePreferences
  estimatedTodayIncome: BalanceHistoryEstimatedTodayIncomePreferences
  retentionDays: number
}

export const DEFAULT_BALANCE_HISTORY_PREFERENCES: BalanceHistoryPreferences = {
  enabled: true,
  endOfDayCapture: { enabled: false },
  estimatedTodayIncome: { enabled: false },
  retentionDays: 365,
}
