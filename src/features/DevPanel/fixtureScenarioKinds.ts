/** Inputs shared by fixture builders and dev-panel commands without loading storage. */
export const DEV_FINANCIAL_FIXTURE_KINDS = {
  Common: "common",
  SiteTypes: "site-types",
  SiteStates: "site-states",
} as const

export const DEV_SITE_FINANCIAL_STATES = {
  Default: "default",
  Zero: "zero",
  Missing: "missing",
  Stale: "stale",
  Requests: "requests",
} as const
