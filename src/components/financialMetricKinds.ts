/** Presentation categories shared by financial labels and chart metric options. */
export const FINANCIAL_METRIC_KINDS = {
  Balance: "balance",
  Allowance: "allowance",
  Consumption: "consumption",
  Income: "income",
  Change: "change",
  Tokens: "tokens",
} as const

export type FinancialMetricKind =
  (typeof FINANCIAL_METRIC_KINDS)[keyof typeof FINANCIAL_METRIC_KINDS]
