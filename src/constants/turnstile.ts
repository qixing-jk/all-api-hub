/**
 * Shared constants for Cloudflare Turnstile integration.
 *
 * These values are used across content/background/services so DOM selectors,
 * query parameter names, and default timeouts remain consistent.
 */

export const TURNSTILE_RESPONSE_FIELD_NAME = "cf-turnstile-response" as const
export const TURNSTILE_RESPONSE_FIELD_SELECTOR =
  `[name="${TURNSTILE_RESPONSE_FIELD_NAME}"]` as const

export const TURNSTILE_CONTAINER_CLASS = "cf-turnstile" as const
export const TURNSTILE_CONTAINER_SELECTOR =
  `.${TURNSTILE_CONTAINER_CLASS}` as const

export const TURNSTILE_CHALLENGE_HOST_SUBSTRING =
  "challenges.cloudflare.com" as const
export const TURNSTILE_SCRIPT_SELECTOR =
  `script[src*="${TURNSTILE_CHALLENGE_HOST_SUBSTRING}/turnstile"]` as const
export const TURNSTILE_IFRAME_SELECTOR =
  `iframe[src*="${TURNSTILE_CHALLENGE_HOST_SUBSTRING}"]` as const

export const TURNSTILE_DEFAULT_QUERY_PARAM_NAME = "turnstile" as const

export const TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS = 12_000
