/** Stable status values shared by browser login protocols and their results. */
export const BROWSER_LOGIN_STATUS = {
  Authenticated: "authenticated",
  Cancelled: "cancelled",
  Failed: "failed",
  IdentityMismatch: "identity_mismatch",
  InteractionRequired: "interaction_required",
  SessionBusy: "session_busy",
  Unsupported: "unsupported",
  Uncertain: "uncertain",
} as const

/** Password and OAuth flows must serialize against the same website session. */
export const BROWSER_LOGIN_SESSION_KEYS = {
  NewApi: "new-api-session",
  Sub2Api: "sub2api-session",
} as const

/** Session policy shared by login callers and the native content protocol. */
export const BROWSER_LOGIN_SESSION_MODES = {
  Reuse: "reuse",
  Fresh: "fresh",
} as const
export type BrowserLoginSessionMode =
  (typeof BROWSER_LOGIN_SESSION_MODES)[keyof typeof BROWSER_LOGIN_SESSION_MODES]

/** Initial navigation and post-logout navigation have the same load budget. */
export const BROWSER_LOGIN_PAGE_TIMEOUT_MS = 30_000

/** Distinguishes native verification from a session that needs a user's sign-out. */
export const LOGIN_VERIFICATION_REASONS = {
  Login: "login",
  Session: "login-session",
} as const
export type LoginVerificationReason =
  (typeof LOGIN_VERIFICATION_REASONS)[keyof typeof LOGIN_VERIFICATION_REASONS]
