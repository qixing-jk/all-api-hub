export const USAGE_HISTORY_STORAGE_KEYS = {
  STORE: "usageHistory_store",
} as const

export const USAGE_HISTORY_ALARM_NAME = "usageHistorySync" as const

export const USAGE_HISTORY_LIMITS = {
  /**
   * Hard cap on pages fetched per account sync run.
   *
   * New-API installations can have very large histories; this cap prevents
   * long-running background work. When hit, the cursor is still advanced
   * safely because ingestion runs from older pages to newer pages.
   */
  maxPages: 20,
  /**
   * Hard cap on items ingested per account sync run.
   */
  maxItems: 2000,
  /**
   * Cap on stored cursor fingerprints at the boundary timestamp.
   */
  maxFingerprints: 256,
} as const

export const USAGE_HISTORY_UNSUPPORTED_COOLDOWN_MS = 24 * 60 * 60 * 1000
