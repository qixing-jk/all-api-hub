/** Native usage scopes shared by adapters, codecs and presentation. */
export const ACCOUNT_USAGE_SCOPES = {
  Today: "today",
  CurrentPeriod: "current_period",
  SiteToday: "site_today",
  RollingWindow: "rolling_window",
  Lifetime: "lifetime",
  Unknown: "unknown",
} as const
