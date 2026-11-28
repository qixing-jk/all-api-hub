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
      /** Read-only target wait before a native page click; capped at 10 seconds. */
      targetWaitMs?: number
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

export const CHECKIN_PAGE_ACTION_STATUSES = {
  Clicked: "clicked",
  TargetNotFound: "target_not_found",
  Throttled: "throttled",
  Error: "error",
} as const

export type CheckinPageActionTriggerStatus =
  (typeof CHECKIN_PAGE_ACTION_STATUSES)[keyof typeof CHECKIN_PAGE_ACTION_STATUSES]

export const CHECKIN_PAGE_ACTION_REASONS = {
  Clicked: "clicked",
  Disabled: "disabled",
  MaxAttempts: "maxAttempts",
  MissingRequestId: "missingRequestId",
  NoTarget: "noTarget",
  Throttled: "throttled",
  UnexpectedError: "unexpectedError",
} as const

export type CheckinPageActionTriggerReason =
  (typeof CHECKIN_PAGE_ACTION_REASONS)[keyof typeof CHECKIN_PAGE_ACTION_REASONS]

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
  verification?: PageVerificationResult
}

export const PAGE_VERIFICATION_STATUSES = {
  NotPresent: "not_present",
  Completed: "completed",
  Required: "required",
} as const

export const PAGE_VERIFICATION_PROVIDERS = {
  Turnstile: "turnstile",
  Recaptcha: "recaptcha",
  Hcaptcha: "hcaptcha",
  Altcha: "altcha",
  Image: "image",
  Interactive: "interactive",
} as const

/** Evidence from observing a native page action, without exporting captcha tokens. */
export type PageVerificationResult =
  | { status: typeof PAGE_VERIFICATION_STATUSES.NotPresent }
  | {
      status:
        | typeof PAGE_VERIFICATION_STATUSES.Completed
        | typeof PAGE_VERIFICATION_STATUSES.Required
      provider: (typeof PAGE_VERIFICATION_PROVIDERS)[keyof typeof PAGE_VERIFICATION_PROVIDERS]
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

export const TURNSTILE_TOKEN_WAIT_STATUSES = {
  NotPresent: "not_present",
  TokenObtained: "token_obtained",
  Timeout: "timeout",
} as const

export type TurnstileTokenWaitStatus =
  (typeof TURNSTILE_TOKEN_WAIT_STATUSES)[keyof typeof TURNSTILE_TOKEN_WAIT_STATUSES]

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
