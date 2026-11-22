export const USAGE_ANALYTICS_CHART_TYPES = {
  Pie: "pie",
  Bar: "bar",
} as const

export type UsageAnalyticsChartDisplayType =
  (typeof USAGE_ANALYTICS_CHART_TYPES)[keyof typeof USAGE_ANALYTICS_CHART_TYPES]

export const USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS = {
  SlowModels: "slowModels",
  SlowTokens: "slowTokens",
  AccountComparison: "accountComparison",
  ModelDistribution: "modelDistribution",
  ModelCostDistribution: "modelCostDistribution",
} as const

export type UsageAnalyticsBreakdownChartKey =
  (typeof USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS)[keyof typeof USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS]
