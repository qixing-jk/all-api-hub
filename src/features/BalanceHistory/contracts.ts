import type { DailyBalanceHistoryMetric } from "~/services/history/dailyBalanceHistory/selectors"

export const QUICK_RANGES = [
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
  { id: "90d", days: 90 },
  { id: "180d", days: 180 },
  { id: "365d", days: 365 },
] as const

export const BALANCE_HISTORY_BREAKDOWN_CHART_TYPES = {
  Pie: "pie",
  Bar: "bar",
} as const
export type BalanceHistoryBreakdownChartType =
  (typeof BALANCE_HISTORY_BREAKDOWN_CHART_TYPES)[keyof typeof BALANCE_HISTORY_BREAKDOWN_CHART_TYPES]

export const BALANCE_HISTORY_TREND_SERIES_SCOPES = {
  Accounts: "accounts",
  Total: "total",
} as const
export type BalanceHistoryTrendSeriesScope =
  (typeof BALANCE_HISTORY_TREND_SERIES_SCOPES)[keyof typeof BALANCE_HISTORY_TREND_SERIES_SCOPES]
export type BalanceHistoryQuickRangeId = (typeof QUICK_RANGES)[number]["id"]
export type BalanceHistoryVisibleMetric = DailyBalanceHistoryMetric
