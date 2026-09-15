import { isSafeRegexPattern } from "~/utils/core/regex"

/**
 * Declarative browser check-in contracts.
 *
 * These values cross extension runtime boundaries. They intentionally describe
 * only bounded DOM actions and observations; arbitrary JavaScript is not part
 * of the contract.
 */

export const BROWSER_CHECK_IN_ACTION_KINDS = {
  PageLoad: "page_load",
  ClickSelector: "click_selector",
  ClickText: "click_text",
} as const

export type BrowserCheckInAction =
  | { kind: typeof BROWSER_CHECK_IN_ACTION_KINDS.PageLoad }
  | {
      kind: typeof BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector
      selector: string
    }
  | {
      kind: typeof BROWSER_CHECK_IN_ACTION_KINDS.ClickText
      textPattern: string
      candidateSelector?: string
    }

export interface BrowserCheckInSuccessCondition {
  selector?: string
  textPattern?: string
  urlPattern?: string
}

export interface BrowserCheckInIdentityCondition {
  selector: string
  textPattern: string
}

export interface BrowserCheckInConfig {
  enabled: boolean
  action: BrowserCheckInAction
  success: BrowserCheckInSuccessCondition
  identity?: BrowserCheckInIdentityCondition
  timeoutMs?: number
}

export const BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS = 30_000 as const
export const BROWSER_CHECK_IN_MIN_TIMEOUT_MS = 1_000 as const
export const BROWSER_CHECK_IN_MAX_TIMEOUT_MS = 120_000 as const
export const BROWSER_CHECK_IN_MAX_SELECTOR_LENGTH = 500 as const
export const BROWSER_CHECK_IN_MAX_PATTERN_LENGTH = 200 as const

export const BROWSER_CHECK_IN_MATCH_KINDS = {
  Selector: "selector",
  Text: "text",
  Url: "url",
} as const

export type BrowserCheckInMatchKind =
  (typeof BROWSER_CHECK_IN_MATCH_KINDS)[keyof typeof BROWSER_CHECK_IN_MATCH_KINDS]

export const BROWSER_CHECK_IN_STEP_REASONS = {
  Completed: "completed",
  Pending: "pending",
  ActionTriggered: "action_triggered",
  IdentityMissing: "identity_missing",
  IdentityMismatch: "identity_mismatch",
  ActionTargetMissing: "action_target_missing",
  InvalidRequest: "invalid_request",
} as const

export type BrowserCheckInStepReason =
  (typeof BROWSER_CHECK_IN_STEP_REASONS)[keyof typeof BROWSER_CHECK_IN_STEP_REASONS]

export interface BrowserCheckInStepResult {
  success: boolean
  reason: BrowserCheckInStepReason
  actionTriggered: boolean
  matchedCondition?: BrowserCheckInMatchKind
  currentUrl?: string
}

export const BROWSER_CHECK_IN_EXECUTION_REASONS = {
  Completed: "completed",
  Timeout: "timeout",
  IdentityMissing: "identity_missing",
  IdentityMismatch: "identity_mismatch",
  ActionTargetNotFound: "action_target_not_found",
  InvalidRequest: "invalid_request",
  TriggerFailed: "trigger_failed",
} as const

export type BrowserCheckInExecutionReason =
  (typeof BROWSER_CHECK_IN_EXECUTION_REASONS)[keyof typeof BROWSER_CHECK_IN_EXECUTION_REASONS]

export interface BrowserCheckInExecutionResult {
  success: boolean
  reason: BrowserCheckInExecutionReason
  actionTriggered?: boolean
  matchedCondition?: BrowserCheckInMatchKind
  currentUrl?: string
  error?: string
}

/** Validates the bounded result returned across the extension runtime boundary. */
export function isBrowserCheckInExecutionResult(
  value: unknown,
): value is BrowserCheckInExecutionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const result = value as Record<string, unknown>
  return (
    typeof result.success === "boolean" &&
    Object.values(BROWSER_CHECK_IN_EXECUTION_REASONS).includes(
      result.reason as BrowserCheckInExecutionReason,
    ) &&
    (result.actionTriggered === undefined ||
      typeof result.actionTriggered === "boolean") &&
    (result.matchedCondition === undefined ||
      Object.values(BROWSER_CHECK_IN_MATCH_KINDS).includes(
        result.matchedCondition as BrowserCheckInMatchKind,
      )) &&
    (result.currentUrl === undefined ||
      typeof result.currentUrl === "string") &&
    (result.error === undefined || typeof result.error === "string")
  )
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

/** Accepts only bounded CSS selector text for declarative DOM access. */
export function isSafeBrowserCheckInSelector(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    value.trim().length <= BROWSER_CHECK_IN_MAX_SELECTOR_LENGTH
  )
}

/** Accepts only bounded regular expressions safe for browser check-in matching. */
export function isSafeBrowserCheckInPattern(value: unknown): value is string {
  if (
    !isNonEmptyString(value) ||
    value.trim().length > BROWSER_CHECK_IN_MAX_PATTERN_LENGTH
  ) {
    return false
  }

  try {
    return isSafeRegexPattern(value.trim(), "i")
  } catch {
    return false
  }
}

/** Validates the closed set of browser actions crossing the runtime boundary. */
export function isBrowserCheckInAction(
  value: unknown,
): value is BrowserCheckInAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const action = value as Record<string, unknown>
  if (action.kind === BROWSER_CHECK_IN_ACTION_KINDS.PageLoad) {
    return Object.keys(action).every((key) => key === "kind")
  }
  if (action.kind === BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector) {
    return (
      Object.keys(action).every(
        (key) => key === "kind" || key === "selector",
      ) && isSafeBrowserCheckInSelector(action.selector)
    )
  }
  if (action.kind === BROWSER_CHECK_IN_ACTION_KINDS.ClickText) {
    return (
      Object.keys(action).every(
        (key) =>
          key === "kind" ||
          key === "textPattern" ||
          key === "candidateSelector",
      ) &&
      isSafeBrowserCheckInPattern(action.textPattern) &&
      (action.candidateSelector === undefined ||
        isSafeBrowserCheckInSelector(action.candidateSelector))
    )
  }
  return false
}

/** Validates that at least one bounded success condition is configured. */
export function isBrowserCheckInSuccessCondition(
  value: unknown,
): value is BrowserCheckInSuccessCondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const condition = value as Record<string, unknown>
  if (
    !Object.keys(condition).every((key) =>
      ["selector", "textPattern", "urlPattern"].includes(key),
    )
  ) {
    return false
  }

  const hasSelector =
    condition.selector !== undefined &&
    isSafeBrowserCheckInSelector(condition.selector)
  const hasTextPattern =
    condition.textPattern !== undefined &&
    isSafeBrowserCheckInPattern(condition.textPattern)
  const hasUrlPattern =
    condition.urlPattern !== undefined &&
    isSafeBrowserCheckInPattern(condition.urlPattern)

  return (
    (condition.selector === undefined || hasSelector) &&
    (condition.textPattern === undefined || hasTextPattern) &&
    (condition.urlPattern === undefined || hasUrlPattern) &&
    (hasSelector || hasTextPattern || hasUrlPattern)
  )
}

/** Validates the optional identity selector and matching pattern pair. */
export function isBrowserCheckInIdentityCondition(
  value: unknown,
): value is BrowserCheckInIdentityCondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const identity = value as Record<string, unknown>
  return (
    Object.keys(identity).every(
      (key) => key === "selector" || key === "textPattern",
    ) &&
    isSafeBrowserCheckInSelector(identity.selector) &&
    isSafeBrowserCheckInPattern(identity.textPattern)
  )
}

/** Validates the complete persisted browser check-in configuration. */
export function isBrowserCheckInConfig(
  value: unknown,
): value is BrowserCheckInConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const config = value as Record<string, unknown>
  const timeoutIsValid =
    config.timeoutMs === undefined ||
    (typeof config.timeoutMs === "number" &&
      Number.isInteger(config.timeoutMs) &&
      config.timeoutMs >= BROWSER_CHECK_IN_MIN_TIMEOUT_MS &&
      config.timeoutMs <= BROWSER_CHECK_IN_MAX_TIMEOUT_MS)

  return (
    Object.keys(config).every((key) =>
      ["enabled", "action", "success", "identity", "timeoutMs"].includes(key),
    ) &&
    typeof config.enabled === "boolean" &&
    isBrowserCheckInAction(config.action) &&
    isBrowserCheckInSuccessCondition(config.success) &&
    (config.identity === undefined ||
      isBrowserCheckInIdentityCondition(config.identity)) &&
    timeoutIsValid
  )
}
