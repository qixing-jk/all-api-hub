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

export const TURNSTILE_DEFAULT_QUERY_PARAM_NAME = "turnstile" as const

export const TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS = 12_000

/** Quiet automatic attempt before asking the user to finish an interactive widget. */
export const TURNSTILE_AUTO_ASSIST_MS = 4_000

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
