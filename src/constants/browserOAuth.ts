/** Compatibility name for existing OAuth callers; account login owns the outcomes. */
export { BROWSER_LOGIN_STATUS as BROWSER_OAUTH_STATUS } from "./browserLogin"

/** Parsing outcomes before the browser executor accepts account authentication. */
export const BROWSER_OAUTH_COMPLETION_STATUS = {
  Verified: "verified",
  Invalid: "invalid",
} as const

/** Safe request outcomes shared by content actions and browser orchestration. */
export const BROWSER_OAUTH_REQUEST_FAILURE_REASONS = {
  RequestFailed: "request_failed",
  Uncertain: "uncertain",
} as const

export type BrowserOAuthRequestFailureReason =
  (typeof BROWSER_OAUTH_REQUEST_FAILURE_REASONS)[keyof typeof BROWSER_OAUTH_REQUEST_FAILURE_REASONS]

/** Fixed content-protocol failures; these values cross extension messages. */
export const BROWSER_OAUTH_CONTENT_FAILURE_REASONS = {
  UnexpectedOrigin: "unexpected_origin",
  UnexpectedPage: "unexpected_page",
  IdentityMismatch: "identity_mismatch",
  Unsupported: "unsupported",
  InteractionRequired: "interaction_required",
  AuthorizationControlUnavailable: "authorization_control_unavailable",
} as const
