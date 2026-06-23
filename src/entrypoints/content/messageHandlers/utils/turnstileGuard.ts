import {
  TURNSTILE_CONTAINER_SELECTOR,
  TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS,
  TURNSTILE_IFRAME_SELECTOR,
  TURNSTILE_RESPONSE_FIELD_SELECTOR,
  TURNSTILE_SCRIPT_SELECTOR,
} from "~/constants/turnstile"
import type {
  CheckinPageActionTriggerResult,
  TurnstilePreTrigger,
  TurnstileTokenWaitResult,
  TurnstileWidgetDetection,
} from "~/types/turnstile"
import { createLogger } from "~/utils/core/logger"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"

/**
 * Unified logger scoped to Turnstile detection/auto-start helpers.
 */
const logger = createLogger("TurnstileGuard")

type TurnstileAutoStartAttempt = {
  attempted: boolean
  method: "click" | "none"
  reason: string
}

type TurnstileAutoStartState = {
  attempts: number
  lastAttemptAt: number
}

declare global {
  var __aahTurnstileAutoStartState:
    | Map<string, TurnstileAutoStartState>
    | undefined

  var __aahTurnstilePreTriggerState:
    | Map<string, TurnstileAutoStartState>
    | undefined
}

const TURNSTILE_AUTOSTART_MIN_INTERVAL_MS = 1000
const TURNSTILE_AUTOSTART_MAX_ATTEMPTS = 3

const PRETRIGGER_DEFAULT_MIN_INTERVAL_MS = 1200
const PRETRIGGER_DEFAULT_MAX_ATTEMPTS = 2
const PRETRIGGER_SETTLE_DELAY_MS = 600

const MAX_PATTERN_LENGTH = 200

const DEFAULT_CHECKIN_TRIGGER_CANDIDATE_SELECTOR = 'button, a, [role="button"]'
const DEFAULT_CHECKIN_TRIGGER_POSITIVE_PATTERN = "(签到|check\\s*in|checkin)"
const DEFAULT_CHECKIN_TRIGGER_NEGATIVE_PATTERN = "(已签到|already)"

const DEFAULT_WAIT_TIMEOUT_MS = TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS
const MIN_WAIT_TIMEOUT_MS = 500
const MAX_WAIT_TIMEOUT_MS = 30_000
const WAIT_POLL_INTERVAL_MS = 250

/**
 * Per-request throttling state for Turnstile auto-start clicks.
 *
 * Stored on `globalThis` so repeated invocations within the same content-script
 * lifetime share throttling limits.
 */
function getTurnstileAutoStartStateMap(): Map<string, TurnstileAutoStartState> {
  const existing = globalThis.__aahTurnstileAutoStartState
  if (existing) return existing

  const created = new Map<string, TurnstileAutoStartState>()
  globalThis.__aahTurnstileAutoStartState = created
  return created
}

/**
 * Clears any stored Turnstile auto-start throttling state for a request.
 */
function clearTurnstileAutoStartState(requestId?: string | null): void {
  const normalized = (requestId || "").trim()
  if (!normalized) return
  try {
    getTurnstileAutoStartStateMap().delete(normalized)
  } catch {
    // ignore
  }
}

/**
 * Per-request state for Turnstile pre-trigger clicks (e.g. clicking a "check-in"
 * button to render the widget).
 */
function getTurnstilePreTriggerStateMap(): Map<
  string,
  TurnstileAutoStartState
> {
  const existing = globalThis.__aahTurnstilePreTriggerState
  if (existing) return existing

  const created = new Map<string, TurnstileAutoStartState>()
  globalThis.__aahTurnstilePreTriggerState = created
  return created
}

/**
 * Clears stored Turnstile pre-trigger throttling state for a request.
 */
function clearTurnstilePreTriggerState(requestId?: string | null): void {
  const normalized = (requestId || "").trim()
  if (!normalized) return
  try {
    getTurnstilePreTriggerStateMap().delete(normalized)
  } catch {
    // ignore
  }
}

/**
 * Clears all Turnstile throttling state associated with a request.
 */
function clearTurnstileGuardState(requestId?: string | null): void {
  clearTurnstileAutoStartState(requestId)
  clearTurnstilePreTriggerState(requestId)
}

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

  const hasResponseField = (() => {
    try {
      return Boolean(document.querySelector(TURNSTILE_RESPONSE_FIELD_SELECTOR))
    } catch {
      return false
    }
  })()

  const hasContainer = (() => {
    try {
      return Boolean(document.querySelector(TURNSTILE_CONTAINER_SELECTOR))
    } catch {
      return false
    }
  })()

  const hasScript = (() => {
    try {
      return Boolean(document.querySelector(TURNSTILE_SCRIPT_SELECTOR))
    } catch {
      return false
    }
  })()

  const hasIframe = (() => {
    try {
      return Boolean(document.querySelector(TURNSTILE_IFRAME_SELECTOR))
    } catch {
      return false
    }
  })()

  if (hasResponseField) {
    score += 3
    reasons.push("cf-turnstile-response-field")
  }

  if (hasContainer) {
    score += 2
    reasons.push("cf-turnstile-class")
  }

  if (hasScript) {
    score += 1
    reasons.push("turnstile-script")
  }

  if (hasIframe) {
    score += 1
    reasons.push("turnstile-iframe")
  }

  const hasTurnstile = Boolean(
    hasResponseField || hasContainer || hasScript || hasIframe,
  )

  return {
    hasTurnstile,
    score,
    reasons,
    title,
    url: currentUrl,
  }
}

/**
 * Read the `cf-turnstile-response` token value from DOM fields.
 */
function readTurnstileTokenFromDom(): string | null {
  let fields: NodeListOf<Element> | null = null

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

/**
 * Best-effort click simulation that works across different widget wrappers.
 */
function simulateClick(target: HTMLElement) {
  try {
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    )
    target.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    )
  } catch {
    try {
      target.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      )
      target.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      )
    } catch {
      // ignore
    }
  }

  try {
    target.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    )
  } catch {
    // ignore
  }

  try {
    target.click()
  } catch {
    // ignore
  }
}

/**
 * Resolve a stable click target used to "wake" Turnstile (best-effort).
 */
function getTurnstileClickTarget(): HTMLElement | null {
  const container = (() => {
    try {
      return document.querySelector(TURNSTILE_CONTAINER_SELECTOR)
    } catch {
      return null
    }
  })()

  if (container instanceof HTMLElement) {
    return container
  }

  const iframe = (() => {
    try {
      return document.querySelector(TURNSTILE_IFRAME_SELECTOR)
    } catch {
      return null
    }
  })()

  if (iframe instanceof HTMLElement) {
    return iframe
  }

  return null
}

/**
 * Compile a case-insensitive regex from a pattern string.
 * Falls back to the provided regex when compilation fails.
 */
function compileCaseInsensitiveRegex(
  pattern: string | undefined,
  fallback: RegExp,
): RegExp {
  const normalized = typeof pattern === "string" ? pattern.trim() : ""
  if (!normalized) return fallback
  if (normalized.length > MAX_PATTERN_LENGTH) return fallback
  try {
    return new RegExp(normalized, "i")
  } catch {
    return fallback
  }
}

/**
 * Compile an optional case-insensitive regex from a pattern string.
 */
function compileOptionalCaseInsensitiveRegex(
  pattern: string | undefined,
  fallback: RegExp | null = null,
): RegExp | null {
  const normalized = typeof pattern === "string" ? pattern.trim() : ""
  if (!normalized) return fallback
  if (normalized.length > MAX_PATTERN_LENGTH) return fallback
  try {
    return new RegExp(normalized, "i")
  } catch {
    return fallback
  }
}

/**
 * Returns the label for a pre-trigger when available.
 */
function getPreTriggerLabel(preTrigger: TurnstilePreTrigger): string | null {
  if (preTrigger.kind === "clickSelector" || preTrigger.kind === "clickText") {
    const normalized = String(preTrigger.label ?? "").trim()
    return normalized ? normalized : null
  }
  return null
}

/**
 * Finds a clickable element by text content using the provided patterns.
 */
function findClickableByText(params: {
  candidateSelector: string
  positive: RegExp
  negative?: RegExp | null
}): HTMLElement | null {
  const { candidateSelector, positive, negative } = params

  const candidates = (() => {
    try {
      return Array.from(document.querySelectorAll(candidateSelector))
    } catch {
      return []
    }
  })()

  const matches: { el: HTMLElement; text: string }[] = []

  for (const node of candidates) {
    if (!(node instanceof HTMLElement)) continue
    const text = String(node.textContent ?? "").trim()
    if (!text) continue
    if (!positive.test(text)) continue
    if (negative && negative.test(text)) continue
    matches.push({ el: node, text })
  }

  if (matches.length === 0) return null

  // Prefer the shortest matching label (usually the primary button).
  matches.sort((a, b) => a.text.length - b.text.length)
  return matches[0].el
}

/**
 * Resolve the effective pre-trigger throttle configuration.
 */
function resolvePreTriggerThrottle(preTrigger: TurnstilePreTrigger): {
  maxAttempts: number
  minIntervalMs: number
} {
  if (preTrigger.kind === "none") {
    return {
      maxAttempts: PRETRIGGER_DEFAULT_MAX_ATTEMPTS,
      minIntervalMs: PRETRIGGER_DEFAULT_MIN_INTERVAL_MS,
    }
  }

  const throttle = preTrigger.throttle

  const rawMaxAttempts = throttle?.maxAttempts
  const maxAttempts =
    typeof rawMaxAttempts === "number" && Number.isFinite(rawMaxAttempts)
      ? Math.max(0, Math.floor(rawMaxAttempts))
      : PRETRIGGER_DEFAULT_MAX_ATTEMPTS

  const rawMinInterval = throttle?.minIntervalMs
  const minIntervalMs =
    typeof rawMinInterval === "number" && Number.isFinite(rawMinInterval)
      ? Math.max(0, Math.floor(rawMinInterval))
      : PRETRIGGER_DEFAULT_MIN_INTERVAL_MS

  return { maxAttempts, minIntervalMs }
}

/**
 * Convert DOM click details into a runtime-message-safe action result.
 */
function toActionTriggerResult(params: {
  status: CheckinPageActionTriggerResult["status"]
  clicked: boolean
  reason: CheckinPageActionTriggerResult["reason"]
  detection: TurnstileWidgetDetection
  target?: HTMLElement
  error?: string
}): CheckinPageActionTriggerResult {
  return {
    status: params.status,
    clicked: params.clicked,
    reason: params.reason,
    detection: params.detection,
    ...(params.target
      ? {
          target: {
            tagName: params.target.tagName.toLowerCase(),
            text: String(params.target.textContent ?? "")
              .trim()
              .slice(0, 80),
          },
        }
      : {}),
    ...(params.error ? { error: params.error } : {}),
  }
}

/**
 * Resolve the configured check-in action target without clicking it.
 */
function resolveCheckinPageActionTarget(
  trigger: TurnstilePreTrigger,
): HTMLElement | null {
  if (trigger.kind === "clickSelector") {
    const selector = String(trigger.selector ?? "").trim()
    if (!selector) return null
    try {
      const el = document.querySelector(selector)
      return el instanceof HTMLElement ? el : null
    } catch {
      return null
    }
  }

  if (trigger.kind === "clickText") {
    const positive = compileCaseInsensitiveRegex(trigger.positivePattern, /$^/)
    const negative = compileOptionalCaseInsensitiveRegex(
      trigger.negativePattern,
    )
    const candidateSelector =
      typeof trigger.candidateSelector === "string" &&
      trigger.candidateSelector.trim()
        ? trigger.candidateSelector.trim()
        : DEFAULT_CHECKIN_TRIGGER_CANDIDATE_SELECTOR

    return findClickableByText({ candidateSelector, positive, negative })
  }

  if (trigger.kind === "checkinButton") {
    const positive = compileCaseInsensitiveRegex(
      trigger.positivePattern,
      new RegExp(DEFAULT_CHECKIN_TRIGGER_POSITIVE_PATTERN, "i"),
    )
    const negative = compileCaseInsensitiveRegex(
      trigger.negativePattern,
      new RegExp(DEFAULT_CHECKIN_TRIGGER_NEGATIVE_PATTERN, "i"),
    )
    const candidateSelector =
      typeof trigger.candidateSelector === "string" &&
      trigger.candidateSelector.trim()
        ? trigger.candidateSelector.trim()
        : DEFAULT_CHECKIN_TRIGGER_CANDIDATE_SELECTOR

    return findClickableByText({ candidateSelector, positive, negative })
  }

  return null
}

/**
 * Trigger the page's own check-in action using the same safe target selection
 * used by Turnstile pre-trigger waits. This helper never decides whether
 * check-in succeeded; callers must verify server-side account status.
 */
export function triggerCheckinPageAction(params: {
  requestId?: string | null
  trigger?: TurnstilePreTrigger
  detection?: TurnstileWidgetDetection
}): CheckinPageActionTriggerResult {
  const detection = params.detection ?? detectTurnstileWidget()
  const requestId = (params.requestId || "").trim()
  if (!requestId) {
    return toActionTriggerResult({
      status: "error",
      clicked: false,
      reason: "missingRequestId",
      detection,
    })
  }

  const trigger = params.trigger
  if (!trigger || trigger.kind === "none") {
    return toActionTriggerResult({
      status: "target_not_found",
      clicked: false,
      reason: "disabled",
      detection,
    })
  }

  const { maxAttempts, minIntervalMs } = resolvePreTriggerThrottle(trigger)
  const stateMap = getTurnstilePreTriggerStateMap()
  const now = Date.now()
  const current = stateMap.get(requestId) ?? { attempts: 0, lastAttemptAt: 0 }

  if (current.attempts >= maxAttempts) {
    return toActionTriggerResult({
      status: "throttled",
      clicked: false,
      reason: "maxAttempts",
      detection,
    })
  }

  if (now - current.lastAttemptAt < minIntervalMs) {
    return toActionTriggerResult({
      status: "throttled",
      clicked: false,
      reason: "throttled",
      detection,
    })
  }

  const target = resolveCheckinPageActionTarget(trigger)
  if (!target) {
    logger.debug("Check-in page action skipped: no target found", {
      requestId,
      kind: trigger.kind,
      label: getPreTriggerLabel(trigger),
      url: detection.url ? sanitizeUrlForLog(detection.url) : null,
    })
    return toActionTriggerResult({
      status: "target_not_found",
      clicked: false,
      reason: "noTarget",
      detection,
    })
  }

  stateMap.set(requestId, {
    attempts: current.attempts + 1,
    lastAttemptAt: now,
  })

  try {
    simulateClick(target)
    logger.debug("Check-in page action via click()", {
      requestId,
      kind: trigger.kind,
      label: getPreTriggerLabel(trigger),
      targetText: String(target.textContent ?? "")
        .trim()
        .slice(0, 80),
      url: detection.url ? sanitizeUrlForLog(detection.url) : null,
    })
    return toActionTriggerResult({
      status: "clicked",
      clicked: true,
      reason: "clicked",
      detection,
      target,
    })
  } catch (error) {
    return toActionTriggerResult({
      status: "error",
      clicked: false,
      reason: "unexpectedError",
      detection,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Best-effort: attempt to start Turnstile verification via a stable click target.
 *
 * Note: This helper does not attempt to solve Turnstile. It only dispatches a
 * user-like click and relies on the legitimate widget to produce a token.
 */
export function maybeAutoStartTurnstile(params: {
  requestId?: string | null
  detection?: TurnstileWidgetDetection
}): TurnstileAutoStartAttempt {
  const requestId = (params.requestId || "").trim()
  if (!requestId) {
    return { attempted: false, method: "none", reason: "missingRequestId" }
  }

  const stateMap = getTurnstileAutoStartStateMap()
  const now = Date.now()
  const current = stateMap.get(requestId) ?? { attempts: 0, lastAttemptAt: 0 }

  if (current.attempts >= TURNSTILE_AUTOSTART_MAX_ATTEMPTS) {
    return { attempted: false, method: "none", reason: "maxAttempts" }
  }

  if (now - current.lastAttemptAt < TURNSTILE_AUTOSTART_MIN_INTERVAL_MS) {
    return { attempted: false, method: "none", reason: "throttled" }
  }

  const target = getTurnstileClickTarget()
  if (!target) {
    return { attempted: false, method: "none", reason: "noTarget" }
  }

  stateMap.set(requestId, {
    attempts: current.attempts + 1,
    lastAttemptAt: now,
  })

  try {
    simulateClick(target)
    logger.debug("Turnstile auto-start via click()", {
      requestId,
      url: params.detection?.url
        ? sanitizeUrlForLog(params.detection.url)
        : null,
    })
    return { attempted: true, method: "click", reason: "clicked" }
  } catch {
    return { attempted: false, method: "none", reason: "unexpectedError" }
  }
}

/**
 * Normalize a user-provided timeout into a safe bounded value (ms).
 */
function normalizeTimeoutMs(timeoutMs: unknown): number {
  const raw =
    typeof timeoutMs === "number"
      ? timeoutMs
      : typeof timeoutMs === "string"
        ? Number(timeoutMs)
        : NaN

  const resolved = Number.isFinite(raw) ? raw : DEFAULT_WAIT_TIMEOUT_MS
  return Math.min(Math.max(resolved, MIN_WAIT_TIMEOUT_MS), MAX_WAIT_TIMEOUT_MS)
}

/**
 * Wait for a Turnstile token to appear in the DOM.
 */
export async function waitForTurnstileToken(params: {
  requestId?: string | null
  timeoutMs?: unknown
  preTrigger?: TurnstilePreTrigger
}): Promise<TurnstileTokenWaitResult> {
  let detection = detectTurnstileWidget()

  const preTriggerEnabled = Boolean(
    params.preTrigger && params.preTrigger.kind !== "none",
  )

  const existing = readTurnstileTokenFromDom()
  if (existing) {
    clearTurnstileGuardState(params.requestId)
    return { status: "token_obtained", token: existing, detection }
  }

  if (!detection.hasTurnstile && !preTriggerEnabled) {
    clearTurnstileGuardState(params.requestId)
    return { status: "not_present", token: null, detection }
  }

  const timeoutMs = normalizeTimeoutMs(params.timeoutMs)
  const deadline = Date.now() + timeoutMs

  let sawTurnstile = detection.hasTurnstile

  while (Date.now() < deadline) {
    const token = readTurnstileTokenFromDom()
    if (token) {
      detection = detectTurnstileWidget()
      clearTurnstileGuardState(params.requestId)
      return { status: "token_obtained", token, detection }
    }

    detection = detectTurnstileWidget()
    if (detection.hasTurnstile) {
      sawTurnstile = true
      maybeAutoStartTurnstile({ requestId: params.requestId, detection })
    } else if (preTriggerEnabled) {
      const attempt = triggerCheckinPageAction({
        requestId: params.requestId,
        trigger: params.preTrigger,
        detection,
      })

      if (attempt.clicked) {
        await new Promise((resolve) =>
          setTimeout(resolve, PRETRIGGER_SETTLE_DELAY_MS),
        )
        continue
      }
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_INTERVAL_MS))
  }

  detection = detectTurnstileWidget()
  clearTurnstileGuardState(params.requestId)

  if (!sawTurnstile) {
    return { status: "not_present", token: null, detection }
  }

  return { status: "timeout", token: null, detection }
}
