/**
 * Turnstile-related serializable contracts shared across extension contexts.
 *
 * Important: these payloads may cross `browser.runtime` messaging boundaries, so
 * they must remain JSON-serializable (no functions, DOM nodes, etc.).
 */

export type TurnstilePreTriggerThrottle = {
  /** Maximum number of trigger attempts per requestId. */
  maxAttempts?: number
  /** Minimum interval between attempts (ms). */
  minIntervalMs?: number
}

export const TURNSTILE_PRE_TRIGGER_KINDS = {
  None: "none",
  CheckinButton: "checkinButton",
  ClickSelector: "clickSelector",
  ClickText: "clickText",
} as const

/**
 * Optional pre-trigger action used to *render* a Turnstile widget.
 *
 * Some deployments only display the Turnstile widget after a user action (for
 * example clicking a "check-in" button). The content script can use this spec
 * to perform a best-effort click before waiting for `cf-turnstile-response`.
 */
export type TurnstilePreTrigger =
  | { kind: typeof TURNSTILE_PRE_TRIGGER_KINDS.None }
  | {
      kind: typeof TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton
      /**
       * Regex pattern strings tested against element `textContent`.
       * Patterns are treated as case-insensitive.
       */
      positivePattern?: string
      negativePattern?: string
      /** Candidate selector used when searching for the trigger element. */
      candidateSelector?: string
      throttle?: TurnstilePreTriggerThrottle
    }
  | {
      kind: typeof TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector
      /** CSS selector for the element to click. */
      selector: string
      /** Optional label for logging/debugging. */
      label?: string
      throttle?: TurnstilePreTriggerThrottle
    }
  | {
      kind: typeof TURNSTILE_PRE_TRIGGER_KINDS.ClickText
      /**
       * Regex pattern string tested against element `textContent`.
       * The match is case-insensitive.
       */
      positivePattern: string
      /** Optional regex pattern string used to exclude false positives. */
      negativePattern?: string
      /** Candidate selector used when searching for the trigger element. */
      candidateSelector?: string
      /** Optional label for logging/debugging. */
      label?: string
      throttle?: TurnstilePreTriggerThrottle
    }

export type CheckinPageActionTriggerStatus =
  | "clicked"
  | "target_not_found"
  | "throttled"
  | "error"

export type CheckinPageActionTriggerReason =
  | "clicked"
  | "disabled"
  | "maxAttempts"
  | "missingRequestId"
  | "noTarget"
  | "throttled"
  | "unexpectedError"

export type CheckinPageActionTriggerResult = {
  status: CheckinPageActionTriggerStatus
  clicked: boolean
  reason: CheckinPageActionTriggerReason
  detection: TurnstileWidgetDetection
  target?: {
    tagName: string
    text: string
  }
  error?: string
}

/**
 * Serializable detection information produced by the content script when it
 * scans the current DOM for Cloudflare Turnstile markers.
 */
export type TurnstileWidgetDetection = {
  hasTurnstile: boolean
  score: number
  reasons: string[]
  title: string
  url: string | null
}

export type TurnstileTokenWaitStatus =
  | "not_present"
  | "token_obtained"
  | "timeout"

/**
 * Serializable result produced by content script Turnstile token waits.
 *
 * Note: This is intentionally JSON-serializable because it crosses runtime
 * message boundaries.
 */
export type TurnstileTokenWaitResult = {
  status: TurnstileTokenWaitStatus
  token: string | null
  detection: TurnstileWidgetDetection
}
