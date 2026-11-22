import type { DailyBalanceHistoryMetric } from "~/services/history/dailyBalanceHistory/selectors"

export const BALANCE_HISTORY_TREND_CHART_TYPES = {
  Line: "line",
  Bar: "bar",
} as const
export type BalanceHistoryTrendChartType =
  (typeof BALANCE_HISTORY_TREND_CHART_TYPES)[keyof typeof BALANCE_HISTORY_TREND_CHART_TYPES]

export const BALANCE_HISTORY_CHART_VIEWS = {
  Trend: "trend",
  Breakdown: "breakdown",
} as const
export type BalanceHistoryChartView =
  (typeof BALANCE_HISTORY_CHART_VIEWS)[keyof typeof BALANCE_HISTORY_CHART_VIEWS]

export const BALANCE_HISTORY_QUICK_RANGE_IDS = {
  Days7: "7d",
  Days30: "30d",
  Days90: "90d",
  Days180: "180d",
  Days365: "365d",
} as const

export const QUICK_RANGES = [
  { id: BALANCE_HISTORY_QUICK_RANGE_IDS.Days7, days: 7 },
  { id: BALANCE_HISTORY_QUICK_RANGE_IDS.Days30, days: 30 },
  { id: BALANCE_HISTORY_QUICK_RANGE_IDS.Days90, days: 90 },
  { id: BALANCE_HISTORY_QUICK_RANGE_IDS.Days180, days: 180 },
  { id: BALANCE_HISTORY_QUICK_RANGE_IDS.Days365, days: 365 },
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
