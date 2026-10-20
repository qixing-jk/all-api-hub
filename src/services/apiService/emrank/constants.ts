/** Console routes of the EMRank account API; all same-origin on the saved site URL. */
export const EMRANK_ENDPOINTS = {
  Identity: "/api/auth/session",
  Account: "/api/account",
  CheckIn: "/api/account/check-ins",
  Keys: "/api/access-keys",
  KeySecrets: "/api/access-keys/secrets",
  KeyBatchDelete: "/api/access-keys/batch-delete",
  Catalog: "/api/catalog/models",
  Announcements: "/api/announcements",
  Redeem: "/api/user/topup",
} as const

/** Exact values accepted by the console's native expiration payload. */
export const EMRANK_KEY_EXPIRATION_MODES = {
  Never: "never",
  Month: "month",
  Day: "day",
  Hour: "hour",
  Custom: "custom",
} as const

/** Known check-in states; the parser still accepts future upstream states. */
export const EMRANK_CHECK_IN_STATUSES = {
  Ready: "ready",
  AlreadyClaimed: "already_claimed",
  BeforeOpen: "before_open",
} as const

export const EMRANK_SESSION_COOKIE_NAME = "__Host-gateway_session"

/**
 * EMRank stores atomic Token and displays M Token (1 M = 1,000,000 Token); no cash
 * anchor is published, so the extension keeps the native Token count and the
 * M Token unit instead of inventing a USD price.
 */
export const EMRANK_TOKENS_PER_M_TOKEN = 1_000_000

/** The console signs non-GET writes with a fixed anti-CSRF marker header. */
export const EMRANK_CSRF_HEADER_NAME = "X-Gateway-CSRF"
export const EMRANK_CSRF_HEADER_VALUE = "1"

/** Account, key and pricing amounts share the same atomic Token asset. */
export const EMRANK_TOKEN_ASSET = {
  // Stable asset identity, independent of a request URL or a display label.
  id: "https://emrank.tech/token",
  label: "Token",
  displayScale: EMRANK_TOKENS_PER_M_TOKEN,
  displayLabel: "M Token",
} as const
