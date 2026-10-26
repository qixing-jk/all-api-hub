/** Console routes of the PM-API account API, all same-origin on the saved site URL. */
export const PMAPI_ENDPOINTS = {
  Identity: "/api/me",
  TodayStats: "/api/me/stats",
  Tokens: "/api/tokens",
  TokenGroups: "/api/token-groups",
  CheckIn: "/api/me/checkin",
  Redeem: "/api/me/redeem",
  Aff: "/api/me/aff",
  Models: "/api/me/models",
  Pricing: "/api/pricing",
  Status: "/api/status",
} as const

/**
 * Native token lifecycle values, shared by parsing and editing. `1`/`2` are
 * user-controlled; `3` (已过期) and `4` (额度耗尽) are server-derived states
 * that still appear in list rows.
 */
export const PMAPI_KEY_STATUSES = {
  Enabled: 1,
  Disabled: 2,
  Expired: 3,
  QuotaExhausted: 4,
} as const

/** `expired_at` sentinel for a token that never expires. */
export const PMAPI_KEY_NEVER_EXPIRES = -1

/** localStorage key holding the console's Bearer session token. */
export const PMAPI_TOKEN_STORAGE_KEY = "pm_token"
