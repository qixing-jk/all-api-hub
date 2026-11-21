/**
 * Alarm name used for the optional end-of-day capture run.
 */
export const DAILY_BALANCE_HISTORY_ALARM_NAME = "dailyBalanceHistoryCapture"

export const DAILY_BALANCE_HISTORY_METRICS = {
  Balance: "balance",
  Income: "income",
  EstimatedIncome: "estimatedIncome",
  Outcome: "outcome",
  Net: "net",
} as const

export const FINANCIAL_HISTORY_ACTIVITY_KINDS = {
  Income: "income",
  Consumption: "consumption",
  Net: "net",
  Estimate: "estimate",
} as const
