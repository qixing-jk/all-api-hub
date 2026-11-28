/**
 * Shared constants for Cloudflare Turnstile integration.
 *
 * These values are used across content/background/services so DOM selectors,
 * query parameter names, and default timeouts remain consistent.
 */

const TURNSTILE_RESPONSE_FIELD_NAME = "cf-turnstile-response" as const
export const TURNSTILE_RESPONSE_FIELD_SELECTOR =
  `[name="${TURNSTILE_RESPONSE_FIELD_NAME}"]` as const

const TURNSTILE_CONTAINER_CLASS = "cf-turnstile" as const
export const TURNSTILE_CONTAINER_SELECTOR =
  `.${TURNSTILE_CONTAINER_CLASS}` as const

const TURNSTILE_CHALLENGE_HOST_SUBSTRING = "challenges.cloudflare.com" as const
export const TURNSTILE_SCRIPT_SELECTOR =
  `script[src*="${TURNSTILE_CHALLENGE_HOST_SUBSTRING}/turnstile"]` as const
export const TURNSTILE_IFRAME_SELECTOR =
  `iframe[src*="${TURNSTILE_CHALLENGE_HOST_SUBSTRING}"]` as const

/** Optional messages from the official widget; never proof of completion. */
export const TURNSTILE_MESSAGE_ORIGIN =
  `https://${TURNSTILE_CHALLENGE_HOST_SUBSTRING}` as const
export const TURNSTILE_MESSAGE_SOURCE = "cloudflare-challenge" as const
export const TURNSTILE_MESSAGE_EVENTS = {
  InteractiveBegin: "interactiveBegin",
  Init: "init",
  RequestExtraParams: "requestExtraParams",
  InteractiveEnd: "interactiveEnd",
  Complete: "complete",
  RefreshRequest: "refreshRequest",
  ReloadRequest: "reloadRequest",
  Fail: "fail",
  Reject: "reject",
  TokenExpired: "tokenExpired",
  InteractiveTimeout: "interactiveTimeout",
} as const

export const TURNSTILE_DEFAULT_QUERY_PARAM_NAME = "turnstile" as const

/** Initial wait and fallback grace period when widget interaction is unknown. */
export const TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS = 12_000

/** Fixed completion budget for a challenge known to be processing automatically. */
export const VERIFICATION_AUTO_WAIT_MS = 45_000

/** Time to notice and open a successfully delivered verification reminder. */
export const VERIFICATION_REMINDER_WAIT_MS = 120_000

/** Time to complete verification after first opening its reminder. */
export const VERIFICATION_OPENED_WAIT_MS = 60_000

/** How long to keep waiting after the temp window is brought forward for the user. */
export const TURNSTILE_MANUAL_WAIT_MS = 45_000

/**
 * How long a verification may wait for its turn in front of the user while
 * another verification window is already being completed.
 */
export const TURNSTILE_ASSIST_TURN_WAIT_MS = 90_000

/** Minimum interval between official Turnstile page-API reads during a wait. */
export const TURNSTILE_PAGE_API_POLL_MS = 750

/** Maximum read-only wait for an explicitly selected native check-in action. */
export const CHECKIN_PAGE_ACTION_TARGET_MAX_WAIT_MS = 10_000
