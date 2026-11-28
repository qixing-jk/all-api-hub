import {
  TURNSTILE_CONTAINER_SELECTOR,
  TURNSTILE_IFRAME_SELECTOR,
  TURNSTILE_RESPONSE_FIELD_SELECTOR,
  TURNSTILE_SCRIPT_SELECTOR,
} from "~/constants/turnstile"
import type { TurnstileWidgetDetection } from "~/types/turnstile"

const TURNSTILE_DOM_MARKERS = [
  {
    selector: TURNSTILE_RESPONSE_FIELD_SELECTOR,
    score: 3,
    reason: "cf-turnstile-response-field",
  },
  {
    selector: TURNSTILE_CONTAINER_SELECTOR,
    score: 2,
    reason: "cf-turnstile-class",
  },
  { selector: TURNSTILE_SCRIPT_SELECTOR, score: 1, reason: "turnstile-script" },
  { selector: TURNSTILE_IFRAME_SELECTOR, score: 1, reason: "turnstile-iframe" },
] as const

/**
 * Detect whether the current page contains Cloudflare Turnstile markers.
 *
 * This detector is intentionally conservative and uses stable DOM markers:
 * - Presence of a `name="cf-turnstile-response"` field
 * - `.cf-turnstile` container
 * - Turnstile iframe/script URLs
 */
export function detectTurnstileWidget(): TurnstileWidgetDetection {
  const reasons: string[] = []
  let score = 0

  const title = String(document.title ?? "")

  const currentUrl = (() => {
    try {
      return window.location.href
    } catch {
      return null
    }
  })()

  for (const marker of TURNSTILE_DOM_MARKERS) {
    try {
      if (document.querySelector(marker.selector)) {
        score += marker.score
        reasons.push(marker.reason)
      }
    } catch {
      // A failed selector does not prevent observing other independent markers.
    }
  }

  return {
    hasTurnstile: reasons.length > 0,
    score,
    reasons,
    title,
    url: currentUrl,
  }
}

/**
 * Read the `cf-turnstile-response` token value from DOM fields.
 */
export function readTurnstileTokenFromDom(): string | null {
  let fields: NodeListOf<Element> | null

  try {
    fields = document.querySelectorAll(TURNSTILE_RESPONSE_FIELD_SELECTOR)
  } catch {
    fields = null
  }

  if (!fields || fields.length === 0) return null

  for (const field of Array.from(fields)) {
    if (
      !(field instanceof HTMLInputElement) &&
      !(field instanceof HTMLTextAreaElement)
    ) {
      continue
    }

    const token = field.value.trim()
    if (token) {
      return token
    }
  }

  return null
}
