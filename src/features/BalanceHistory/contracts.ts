import type { DailyBalanceHistoryMetric } from "~/services/history/dailyBalanceHistory/selectors"

export const QUICK_RANGES = [
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
  { id: "90d", days: 90 },
  { id: "180d", days: 180 },
  { id: "365d", days: 365 },
] as const

export type BalanceHistoryBreakdownChartType = "pie" | "bar"
export type BalanceHistoryTrendSeriesScope = "accounts" | "total"
export type BalanceHistoryQuickRangeId = (typeof QUICK_RANGES)[number]["id"]
export type BalanceHistoryVisibleMetric = DailyBalanceHistoryMetric
