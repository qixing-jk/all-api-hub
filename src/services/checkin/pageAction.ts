import {
  CHECKIN_PAGE_ACTION_TARGET_MAX_WAIT_MS,
  TURNSTILE_CONTAINER_SELECTOR,
  TURNSTILE_IFRAME_SELECTOR,
} from "~/constants/turnstile"
import { collectNativeCheckInPageCandidates } from "~/services/checkin/discovery/evidence/navigationCandidates"
import { isCheckInElementShown } from "~/services/checkin/discovery/evidence/visibility"
import type { NativeCheckInPageProbe } from "~/services/checkin/discovery/nativePageDiscovery"
import {
  detectTurnstileWidget,
  readTurnstileTokenFromDom,
} from "~/services/checkin/turnstile/dom"
import {
  CHECKIN_PAGE_ACTION_REASONS,
  CHECKIN_PAGE_ACTION_STATUSES,
  TURNSTILE_PRE_TRIGGER_KINDS,
  type CheckinPageActionTriggerResult,
  type TurnstilePreTrigger,
  type TurnstileWidgetDetection,
} from "~/types/turnstile"
import { createLogger } from "~/utils/core/logger"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"

const logger = createLogger("CheckinPageAction")
type CheckinPageActionState = { attempts: number; lastAttemptAt: number }
declare global {
  var __aahTurnstilePreTriggerState:
    Map<string, CheckinPageActionState> | undefined
}
const PRETRIGGER_DEFAULT_MIN_INTERVAL_MS = 1200
const PRETRIGGER_DEFAULT_MAX_ATTEMPTS = 2
const WAIT_POLL_INTERVAL_MS = 250

const MAX_PATTERN_LENGTH = 200
const TARGET_TEXT_MAX_LENGTH = 80

const DEFAULT_CHECKIN_TRIGGER_CANDIDATE_SELECTOR = 'button, a, [role="button"]'
const DEFAULT_CHECKIN_TRIGGER_POSITIVE_PATTERN = "(签到|check\\s*in|checkin)"
const DEFAULT_CHECKIN_TRIGGER_NEGATIVE_PATTERN = "(已签到|already)"
const SECTION_HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]'

/**
 * Per-request state for Turnstile pre-trigger clicks (e.g. clicking a "check-in"
 * button to render the widget).
 */
function getTurnstilePreTriggerStateMap(): Map<string, CheckinPageActionState> {
  const existing = globalThis.__aahTurnstilePreTriggerState
  if (existing) return existing

  const created = new Map<string, CheckinPageActionState>()
  globalThis.__aahTurnstilePreTriggerState = created
  return created
}

/**
 * Clears stored Turnstile pre-trigger throttling state for a request.
 */
export function clearCheckinPageActionState(requestId?: string | null): void {
  const normalized = (requestId || "").trim()
  if (!normalized) return
  try {
    getTurnstilePreTriggerStateMap().delete(normalized)
  } catch {
    // ignore
  }
}

/**
 * Compile a case-insensitive regex from a pattern string.
 * Falls back to the provided regex when compilation fails.
 */
function compileCaseInsensitiveRegex<T extends RegExp | null>(
  pattern: string | undefined,
  fallback: T,
): RegExp | T {
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
  if (
    preTrigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector ||
    preTrigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickText
  ) {
    const normalized = String(preTrigger.label ?? "").trim()
    return normalized ? normalized : null
  }
  return null
}

/** Navigation may look like a button, but is never a native grant control. */
function isNavigationLink(element: Element): boolean {
  if (!(element instanceof HTMLAnchorElement)) return false
  const href = element.getAttribute("href")?.trim()
  return Boolean(
    href && href !== "#" && !href.toLowerCase().startsWith("javascript:"),
  )
}

/**
 * Finds a clickable element by text content using the provided patterns.
 */
function findTargetsByText(params: {
  candidateSelector: string
  positive: RegExp
  negative?: RegExp | null
}): HTMLElement[] {
  const { candidateSelector, positive, negative } = params

  const candidates = (() => {
    try {
      return Array.from(document.querySelectorAll(candidateSelector))
    } catch {
      return []
    }
  })()

  const matches: HTMLElement[] = []

  for (const node of candidates) {
    if (!(node instanceof HTMLElement)) continue
    if (!isCheckInElementShown(node)) continue
    if (isNavigationLink(node)) continue
    // A clickable section heading (for example Flowbee's collapsible daily
    // check-in panel) names the area, not its grant action. Explicit selectors
    // keep their provider-owned contract; text discovery must ignore headings.
    if (
      node.matches(SECTION_HEADING_SELECTOR) ||
      node.querySelector(SECTION_HEADING_SELECTOR) ||
      (node.parentElement?.matches(SECTION_HEADING_SELECTOR) &&
        (node.hasAttribute("aria-expanded") ||
          node.hasAttribute("aria-controls")))
    )
      continue
    const text = String(node.textContent ?? "").trim()
    if (!text) continue
    if (!positive.test(text)) continue
    if (negative && negative.test(text)) continue
    matches.push(node)
  }

  return matches
}

/**
 * Resolve the effective pre-trigger throttle configuration.
 */
function resolvePreTriggerThrottle(preTrigger: TurnstilePreTrigger): {
  maxAttempts: number
  minIntervalMs: number
} {
  if (preTrigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.None) {
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
              .slice(0, TARGET_TEXT_MAX_LENGTH),
          },
        }
      : {}),
    ...(params.error ? { error: params.error } : {}),
  }
}

/**
 * Resolve the configured check-in action target without clicking it.
 */
function resolveCheckinPageActionTargets(
  trigger: TurnstilePreTrigger,
): HTMLElement[] {
  if (trigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector) {
    const selector = String(trigger.selector ?? "").trim()
    if (!selector) return []
    try {
      return Array.from(document.querySelectorAll(selector)).filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          isCheckInElementShown(element) &&
          !isNavigationLink(element),
      )
    } catch {
      return []
    }
  }

  if (
    trigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickText ||
    trigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton
  ) {
    const usesDefaultPatterns =
      trigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton
    const positive = compileCaseInsensitiveRegex(
      trigger.positivePattern,
      usesDefaultPatterns
        ? new RegExp(DEFAULT_CHECKIN_TRIGGER_POSITIVE_PATTERN, "i")
        : /$^/,
    )
    const negative = compileCaseInsensitiveRegex(
      trigger.negativePattern,
      usesDefaultPatterns
        ? new RegExp(DEFAULT_CHECKIN_TRIGGER_NEGATIVE_PATTERN, "i")
        : null,
    )
    const candidateSelector =
      typeof trigger.candidateSelector === "string" &&
      trigger.candidateSelector.trim()
        ? trigger.candidateSelector.trim()
        : DEFAULT_CHECKIN_TRIGGER_CANDIDATE_SELECTOR

    return findTargetsByText({ candidateSelector, positive, negative })
  }

  return []
}

/** Disabled controls remain area evidence but cannot authorize a native mutation. */
function isActionable(target: HTMLElement): boolean {
  return (
    isCheckInElementShown(target) &&
    !target.matches(":disabled") &&
    target.getAttribute("aria-disabled") !== "true"
  )
}

/** Inspection and execution use the same unique active target, including explicit selectors. */
function resolveCheckinPageActionTarget(
  trigger: TurnstilePreTrigger,
): HTMLElement | null {
  const targets = resolveCheckinPageActionTargets(trigger).filter(isActionable)
  return targets.length === 1 ? targets[0]! : null
}

/** Read the current action and alternative page links without consuming a click. */
export function inspectCheckinPage(
  trigger: TurnstilePreTrigger,
  acceptVerificationWidget = false,
): NativeCheckInPageProbe {
  const targets = resolveCheckinPageActionTargets(trigger)
  const actionable = targets.filter(isActionable)
  const hasTarget = actionable.length === 1
  const hasCheckInArea =
    targets.length > 0 ||
    Array.from(document.querySelectorAll('button, [role="button"]')).some(
      (node) =>
        isCheckInElementShown(node) &&
        !isNavigationLink(node) &&
        /签到|簽到|check(?:ed)?[\s-]*in/i.test(
          `${node.textContent ?? ""} ${node.getAttribute("aria-label") ?? ""}`,
        ),
    )
  const ready =
    hasTarget ||
    (acceptVerificationWidget &&
      (Boolean(readTurnstileTokenFromDom()) ||
        Array.from(
          document.querySelectorAll(
            `${TURNSTILE_CONTAINER_SELECTOR}, ${TURNSTILE_IFRAME_SELECTOR}`,
          ),
        ).some(isCheckInElementShown)))
  return {
    success: true,
    hasTarget: ready,
    ...(actionable.length > 1 ? { hasAmbiguousTarget: true } : {}),
    ...(hasCheckInArea ? { hasCheckInArea: true } : {}),
    pageUrl: location.href,
    ...(ready
      ? { candidates: [] }
      : collectNativeCheckInPageCandidates(document)),
  }
}

/** Waits for an explicitly selected native action to render without clicking it. */
export async function waitForCheckinPageActionTarget(
  trigger: Extract<
    TurnstilePreTrigger,
    { kind: typeof TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector }
  >,
): Promise<void> {
  const requested = trigger.targetWaitMs
  const timeout =
    typeof requested === "number" && Number.isFinite(requested)
      ? Math.min(CHECKIN_PAGE_ACTION_TARGET_MAX_WAIT_MS, Math.max(0, requested))
      : 0
  const deadline = Date.now() + timeout
  while (!resolveCheckinPageActionTarget(trigger) && Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(WAIT_POLL_INTERVAL_MS, deadline - Date.now()),
      ),
    )
  }
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
      status: CHECKIN_PAGE_ACTION_STATUSES.Error,
      clicked: false,
      reason: CHECKIN_PAGE_ACTION_REASONS.MissingRequestId,
      detection,
    })
  }

  const trigger = params.trigger
  if (!trigger || trigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.None) {
    return toActionTriggerResult({
      status: CHECKIN_PAGE_ACTION_STATUSES.TargetNotFound,
      clicked: false,
      reason: CHECKIN_PAGE_ACTION_REASONS.Disabled,
      detection,
    })
  }

  const { maxAttempts, minIntervalMs } = resolvePreTriggerThrottle(trigger)
  const stateMap = getTurnstilePreTriggerStateMap()
  const now = Date.now()
  const current = stateMap.get(requestId) ?? { attempts: 0, lastAttemptAt: 0 }

  if (current.attempts >= maxAttempts) {
    return toActionTriggerResult({
      status: CHECKIN_PAGE_ACTION_STATUSES.Throttled,
      clicked: false,
      reason: CHECKIN_PAGE_ACTION_REASONS.MaxAttempts,
      detection,
    })
  }

  if (now - current.lastAttemptAt < minIntervalMs) {
    return toActionTriggerResult({
      status: CHECKIN_PAGE_ACTION_STATUSES.Throttled,
      clicked: false,
      reason: CHECKIN_PAGE_ACTION_REASONS.Throttled,
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
      status: CHECKIN_PAGE_ACTION_STATUSES.TargetNotFound,
      clicked: false,
      reason: CHECKIN_PAGE_ACTION_REASONS.NoTarget,
      detection,
    })
  }

  stateMap.set(requestId, {
    attempts: current.attempts + 1,
    lastAttemptAt: now,
  })

  try {
    // A native check-in is a mutation: dispatch exactly one click event.
    target.click()
    logger.debug("Check-in page action via click()", {
      requestId,
      kind: trigger.kind,
      label: getPreTriggerLabel(trigger),
      targetText: String(target.textContent ?? "")
        .trim()
        .slice(0, TARGET_TEXT_MAX_LENGTH),
      url: detection.url ? sanitizeUrlForLog(detection.url) : null,
    })
    return toActionTriggerResult({
      status: CHECKIN_PAGE_ACTION_STATUSES.Clicked,
      clicked: true,
      reason: CHECKIN_PAGE_ACTION_REASONS.Clicked,
      detection,
      target,
    })
  } catch (error) {
    return toActionTriggerResult({
      status: CHECKIN_PAGE_ACTION_STATUSES.Error,
      clicked: false,
      reason: CHECKIN_PAGE_ACTION_REASONS.UnexpectedError,
      detection,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
