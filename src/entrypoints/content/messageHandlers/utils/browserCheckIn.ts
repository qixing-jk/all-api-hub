import {
  BROWSER_CHECK_IN_ACTION_KINDS,
  BROWSER_CHECK_IN_MATCH_KINDS,
  BROWSER_CHECK_IN_STEP_REASONS,
  isBrowserCheckInAction,
  isBrowserCheckInIdentityCondition,
  isBrowserCheckInSuccessCondition,
  type BrowserCheckInAction,
  type BrowserCheckInIdentityCondition,
  type BrowserCheckInStepResult,
  type BrowserCheckInSuccessCondition,
} from "~/types/checkinAutomation"

const DEFAULT_CLICK_CANDIDATE_SELECTOR =
  'button, a, [role="button"], input[type="submit"], input[type="button"]'
const BROWSER_CHECK_IN_ACTION_STATE_TTL_MS = 10 * 60 * 1000
const BROWSER_CHECK_IN_ACTION_STATE_MAX_ENTRIES = 128

declare global {
  var __aahBrowserCheckInActionState: Map<string, number> | undefined
}

/** Returns the content-script-local request de-duplication state. */
function getBrowserCheckInActionState(): Map<string, number> {
  const existing = globalThis.__aahBrowserCheckInActionState
  if (existing) return existing

  const created = new Map<string, number>()
  globalThis.__aahBrowserCheckInActionState = created
  return created
}

/** Removes expired request IDs before the bounded state is reused. */
function pruneBrowserCheckInActionState(now: number): void {
  const state = getBrowserCheckInActionState()
  for (const [requestId, triggeredAt] of state) {
    if (now - triggeredAt >= BROWSER_CHECK_IN_ACTION_STATE_TTL_MS) {
      state.delete(requestId)
    }
  }
}

/** Checks whether a request has already triggered its configured action. */
function hasBrowserCheckInActionTriggered(
  requestId: string | undefined,
): boolean {
  const normalized = requestId?.trim()
  if (!normalized) return false

  const now = Date.now()
  const state = getBrowserCheckInActionState()
  pruneBrowserCheckInActionState(now)
  const triggeredAt = state.get(normalized)
  return (
    triggeredAt !== undefined &&
    now - triggeredAt < BROWSER_CHECK_IN_ACTION_STATE_TTL_MS
  )
}

/** Records one action trigger while keeping the request state bounded. */
function rememberBrowserCheckInAction(requestId: string | undefined): void {
  const normalized = requestId?.trim()
  if (!normalized) return

  const now = Date.now()
  const state = getBrowserCheckInActionState()
  pruneBrowserCheckInActionState(now)
  while (state.size >= BROWSER_CHECK_IN_ACTION_STATE_MAX_ENTRIES) {
    const oldest = state.keys().next().value
    if (typeof oldest !== "string") break
    state.delete(oldest)
  }
  state.set(normalized, now)
}

type QueryResult =
  | { valid: true; element: Element | null }
  | { valid: false; element: null }

/** Queries one selector and converts selector syntax errors into a safe result. */
function queryOne(selector: string): QueryResult {
  try {
    return { valid: true, element: document.querySelector(selector) }
  } catch {
    return { valid: false, element: null }
  }
}

/** Queries multiple candidates and converts selector syntax errors into a safe result. */
function queryAll(
  selector: string,
): { valid: true; elements: Element[] } | { valid: false; elements: [] } {
  try {
    return {
      valid: true,
      elements: Array.from(document.querySelectorAll(selector)),
    }
  } catch {
    return { valid: false, elements: [] }
  }
}

/** Compiles a validated user pattern without allowing malformed input to escape. */
function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i")
  } catch {
    return null
  }
}

/** Filters out controls that cannot safely receive the configured click. */
function isDisabledElement(element: HTMLElement): boolean {
  if (
    (element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    element.disabled
  ) {
    return true
  }

  return (
    element.hidden ||
    element.getAttribute("aria-disabled") === "true" ||
    element.getAttribute("aria-hidden") === "true" ||
    (() => {
      try {
        const style = window.getComputedStyle(element)
        return style.display === "none" || style.visibility === "hidden"
      } catch {
        return false
      }
    })()
  )
}

/** Returns trimmed visible text used by identity and text-matching checks. */
function getElementText(element: Element): string {
  return String(element.textContent ?? "").trim()
}

/** Reads rendered page text without treating inline script source as evidence. */
function getVisiblePageText(): string {
  try {
    const body = document.body
    if (!body) return ""

    if (typeof body.innerText === "string") {
      return body.innerText
    }

    const clone = body.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll("script, style, template, noscript")
      .forEach((element) => element.remove())
    return String(clone.textContent ?? "")
  } catch {
    return ""
  }
}

/** Reads the current page URL without letting unavailable location state throw. */
function getCurrentUrl(): string | undefined {
  try {
    return window.location.href
  } catch {
    return undefined
  }
}

/** Finds the shortest enabled candidate whose text matches the configured pattern. */
function findTextTarget(
  selector: string,
  pattern: RegExp,
): { valid: boolean; target: HTMLElement | null } {
  const candidates = queryAll(selector)
  if (!candidates.valid) return { valid: false, target: null }

  const matches = candidates.elements
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => !isDisabledElement(element))
    .map((element) => ({ element, text: getElementText(element) }))
    .filter(({ text }) => text.length > 0 && pattern.test(text))
    .sort((left, right) => left.text.length - right.text.length)

  return { valid: true, target: matches[0]?.element ?? null }
}

/** Evaluates the optional logged-in identity guard before any page action. */
function evaluateIdentity(
  identity: BrowserCheckInIdentityCondition | undefined,
): BrowserCheckInStepReasonResult {
  if (!identity) return { kind: "matched" }

  const selectorResult = queryOne(identity.selector)
  if (!selectorResult.valid) return { kind: "invalid" }
  if (!(selectorResult.element instanceof HTMLElement)) {
    return { kind: "missing" }
  }

  const pattern = compilePattern(identity.textPattern)
  if (!pattern) return { kind: "invalid" }
  return pattern.test(getElementText(selectorResult.element))
    ? { kind: "matched" }
    : { kind: "mismatch" }
}

type BrowserCheckInStepReasonResult =
  | { kind: "matched" }
  | { kind: "missing" }
  | { kind: "mismatch" }
  | { kind: "invalid" }

/** Evaluates configured success evidence without performing any DOM mutation. */
function evaluateSuccessCondition(condition: BrowserCheckInSuccessCondition): {
  valid: boolean
  matchedCondition?: BrowserCheckInStepResult["matchedCondition"]
} {
  if (condition.selector !== undefined) {
    const result = queryOne(condition.selector)
    if (!result.valid) return { valid: false }
    if (result.element) {
      return {
        valid: true,
        matchedCondition: BROWSER_CHECK_IN_MATCH_KINDS.Selector,
      }
    }
  }

  if (condition.textPattern !== undefined) {
    const pattern = compilePattern(condition.textPattern)
    if (!pattern) return { valid: false }
    if (pattern.test(getVisiblePageText())) {
      return {
        valid: true,
        matchedCondition: BROWSER_CHECK_IN_MATCH_KINDS.Text,
      }
    }
  }

  if (condition.urlPattern !== undefined) {
    const pattern = compilePattern(condition.urlPattern)
    const currentUrl = getCurrentUrl()
    if (!pattern || !currentUrl) return { valid: false }
    if (pattern.test(currentUrl)) {
      return { valid: true, matchedCondition: BROWSER_CHECK_IN_MATCH_KINDS.Url }
    }
  }

  return { valid: true }
}

/** Creates the common fail-closed response for invalid browser contracts. */
function invalidResult(): BrowserCheckInStepResult {
  return {
    success: false,
    reason: BROWSER_CHECK_IN_STEP_REASONS.InvalidRequest,
    actionTriggered: false,
    currentUrl: getCurrentUrl(),
  }
}

/** Runs one bounded, declarative page observation and optional click. */
export function runBrowserCheckInStep(input: {
  requestId?: string
  action: BrowserCheckInAction
  success: BrowserCheckInSuccessCondition
  identity?: BrowserCheckInIdentityCondition
  executeAction: boolean
}): BrowserCheckInStepResult {
  if (
    !isBrowserCheckInAction(input.action) ||
    !isBrowserCheckInSuccessCondition(input.success) ||
    (input.identity !== undefined &&
      !isBrowserCheckInIdentityCondition(input.identity))
  ) {
    return invalidResult()
  }

  const identity = evaluateIdentity(input.identity)
  if (identity.kind === "invalid") return invalidResult()
  if (identity.kind === "missing") {
    return {
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.IdentityMissing,
      actionTriggered: false,
      currentUrl: getCurrentUrl(),
    }
  }
  if (identity.kind === "mismatch") {
    return {
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.IdentityMismatch,
      actionTriggered: false,
      currentUrl: getCurrentUrl(),
    }
  }

  const success = evaluateSuccessCondition(input.success)
  if (!success.valid) return invalidResult()
  if (success.matchedCondition) {
    return {
      success: true,
      reason: BROWSER_CHECK_IN_STEP_REASONS.Completed,
      actionTriggered: false,
      matchedCondition: success.matchedCondition,
      currentUrl: getCurrentUrl(),
    }
  }

  if (
    !input.executeAction ||
    input.action.kind === BROWSER_CHECK_IN_ACTION_KINDS.PageLoad
  ) {
    return {
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.Pending,
      actionTriggered: false,
      currentUrl: getCurrentUrl(),
    }
  }

  if (hasBrowserCheckInActionTriggered(input.requestId)) {
    return {
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.Pending,
      actionTriggered: true,
      currentUrl: getCurrentUrl(),
    }
  }

  let target: HTMLElement | null = null
  if (input.action.kind === BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector) {
    const result = queryOne(input.action.selector)
    if (!result.valid) return invalidResult()
    target = result.element instanceof HTMLElement ? result.element : null
  } else if (input.action.kind === BROWSER_CHECK_IN_ACTION_KINDS.ClickText) {
    const pattern = compilePattern(input.action.textPattern)
    if (!pattern) return invalidResult()
    const result = findTextTarget(
      input.action.candidateSelector ?? DEFAULT_CLICK_CANDIDATE_SELECTOR,
      pattern,
    )
    if (!result.valid) return invalidResult()
    target = result.target
  }

  if (!target || isDisabledElement(target)) {
    return {
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.ActionTargetMissing,
      actionTriggered: false,
      currentUrl: getCurrentUrl(),
    }
  }

  try {
    target.click()
    rememberBrowserCheckInAction(input.requestId)
  } catch {
    return invalidResult()
  }

  return {
    success: false,
    reason: BROWSER_CHECK_IN_STEP_REASONS.ActionTriggered,
    actionTriggered: true,
    currentUrl: getCurrentUrl(),
  }
}
