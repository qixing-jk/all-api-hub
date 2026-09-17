/** Stable status values shared by browser OAuth flows and their results. */
export const BROWSER_OAUTH_STATUS = {
  Authenticated: "authenticated",
  Cancelled: "cancelled",
  Failed: "failed",
  IdentityMismatch: "identity_mismatch",
  InteractionRequired: "interaction_required",
  SessionBusy: "session_busy",
  Uncertain: "uncertain",
} as const
