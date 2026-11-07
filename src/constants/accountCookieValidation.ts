/** Outcomes of checking the supplied Cookie independently of ambient login. */
export const ACCOUNT_COOKIE_VALIDATION_STATUS = {
  Valid: "valid",
  Invalid: "invalid",
  IdentityMismatch: "identity_mismatch",
  Unavailable: "unavailable",
} as const

/** Inconclusive diagnostics never imply that the supplied credential was rejected. */
export const ACCOUNT_COOKIE_VALIDATION_REASONS = {
  Unsupported: "unsupported",
  MissingCookie: "missing_cookie",
  MissingIdentity: "missing_identity",
  Permission: "permission",
  Verification: "verification",
  Network: "network",
  InvalidResponse: "invalid_response",
} as const
