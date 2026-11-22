/** Native usage scopes shared by adapters, codecs and presentation. */
export const ACCOUNT_USAGE_SCOPES = {
  Today: "today",
  CurrentPeriod: "current_period",
  SiteToday: "site_today",
  RollingWindow: "rolling_window",
  Lifetime: "lifetime",
  Unknown: "unknown",
} as const

/** Financial field names shared by saved-account references and their display. */
export const ACCOUNT_CASHFLOW_METRICS = {
  Consumption: "consumption",
  Income: "income",
} as const

export type AccountCashflowMetric =
  (typeof ACCOUNT_CASHFLOW_METRICS)[keyof typeof ACCOUNT_CASHFLOW_METRICS]
