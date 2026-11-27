import {
  TURNSTILE_ASSIST_TURN_WAIT_MS,
  TURNSTILE_AUTO_ASSIST_MS,
  TURNSTILE_CONTAINER_SELECTOR,
  TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS,
  TURNSTILE_IFRAME_SELECTOR,
  TURNSTILE_MANUAL_WAIT_MS,
  TURNSTILE_PAGE_API_POLL_MS,
} from "~/constants/turnstile"
import {
  clearCheckinPageActionState,
  triggerCheckinPageAction,
} from "~/services/checkin/pageAction"
import {
  detectTurnstileWidget,
  readTurnstileTokenFromDom,
} from "~/services/checkin/turnstile/dom"
import { createVerificationManualWindow } from "~/services/checkin/verificationManualWindow"
import {
  TURNSTILE_TOKEN_WAIT_STATUSES,
  type TurnstilePreTrigger,
  type TurnstileTokenWaitResult,
  type TurnstileWidgetDetection,
} from "~/types/turnstile"
import { createLogger } from "~/utils/core/logger"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"

/**
 * Unified logger scoped to Turnstile detection/auto-start helpers.
 */
const logger = createLogger("TurnstileGuard")

const TURNSTILE_AUTO_START_METHODS = { Click: "click", None: "none" } as const
const TURNSTILE_AUTO_START_REASONS = {
  MissingRequestId: "missingRequestId",
  MaxAttempts: "maxAttempts",
  Throttled: "throttled",
  NoTarget: "noTarget",
  Clicked: "clicked",
  UnexpectedError: "unexpectedError",
} as const

type TurnstileAutoStartAttempt = {
  attempted: boolean
  method: (typeof TURNSTILE_AUTO_START_METHODS)[keyof typeof TURNSTILE_AUTO_START_METHODS]
  reason: (typeof TURNSTILE_AUTO_START_REASONS)[keyof typeof TURNSTILE_AUTO_START_REASONS]
}

type TurnstileAutoStartState = {
  attempts: number
  lastAttemptAt: number
}

declare global {
  var __aahTurnstileAutoStartState:
    Map<string, TurnstileAutoStartState> | undefined
}

const TURNSTILE_AUTOSTART_MIN_INTERVAL_MS = 1000
const TURNSTILE_AUTOSTART_MAX_ATTEMPTS = 3

const PRETRIGGER_SETTLE_DELAY_MS = 600

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
 * Clears all Turnstile throttling state associated with a request.
 */
function clearTurnstileGuardState(requestId?: string | null): void {
  clearTurnstileAutoStartState(requestId)
  clearCheckinPageActionState(requestId)
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
    return {
      attempted: false,
      method: TURNSTILE_AUTO_START_METHODS.None,
      reason: TURNSTILE_AUTO_START_REASONS.MissingRequestId,
    }
  }

  const stateMap = getTurnstileAutoStartStateMap()
  const now = Date.now()
  const current = stateMap.get(requestId) ?? { attempts: 0, lastAttemptAt: 0 }

  if (current.attempts >= TURNSTILE_AUTOSTART_MAX_ATTEMPTS) {
    return {
      attempted: false,
      method: TURNSTILE_AUTO_START_METHODS.None,
      reason: TURNSTILE_AUTO_START_REASONS.MaxAttempts,
    }
  }

  if (now - current.lastAttemptAt < TURNSTILE_AUTOSTART_MIN_INTERVAL_MS) {
    return {
      attempted: false,
      method: TURNSTILE_AUTO_START_METHODS.None,
      reason: TURNSTILE_AUTO_START_REASONS.Throttled,
    }
  }

  const target = getTurnstileClickTarget()
  if (!target) {
    return {
      attempted: false,
      method: TURNSTILE_AUTO_START_METHODS.None,
      reason: TURNSTILE_AUTO_START_REASONS.NoTarget,
    }
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
    return {
      attempted: true,
      method: TURNSTILE_AUTO_START_METHODS.Click,
      reason: TURNSTILE_AUTO_START_REASONS.Clicked,
    }
  } catch {
    return {
      attempted: false,
      method: TURNSTILE_AUTO_START_METHODS.None,
      reason: TURNSTILE_AUTO_START_REASONS.UnexpectedError,
    }
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
const MAX_ASSIST_DELAY_MS = 120_000
const MAX_PAGE_TOKEN_LENGTH = 4_096

export type TurnstilePageTokenRead = (params: {
  allowExecute: boolean
}) => Promise<string | null>

/**
 * Optional hand-off used when the official widget does not complete on its own.
 * Interactive Turnstile checks require a trusted user gesture, which a content
 * script cannot synthesize. The temp window is brought forward and the wait
 * continues until the widget writes a token.
 */
export type TurnstileUserAssist = {
  /** Quiet period before the window is brought forward. */
  autoAttemptMs?: number
  /** Total wait budget once the user is asked to finish verification. */
  manualTimeoutMs?: number
  /** Minimum gap between official page-API reads. */
  pageTokenIntervalMs?: number
  requestAssist: () => Promise<unknown> | unknown
  readPageToken?: TurnstilePageTokenRead
}

/**
 * Accept a non-negative assist delay without the short-wait clamp.
 */
function normalizeAssistDelay(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback
  }
  return Math.min(value, MAX_ASSIST_DELAY_MS)
}

/**
 * Read a token from the page-world Turnstile client, if the caller provided one.
 */
async function readAssistedPageToken(
  assist: TurnstileUserAssist | undefined,
  allowExecute: boolean,
): Promise<string | null> {
  if (!assist?.readPageToken) return null
  try {
    const token = await assist.readPageToken({ allowExecute })
    if (typeof token !== "string") return null
    const normalized = token.trim()
    if (!normalized || normalized.length > MAX_PAGE_TOKEN_LENGTH) return null
    return normalized
  } catch {
    return null
  }
}

/**
 * Wait for a Turnstile token to appear in the DOM or the official page API.
 */
export async function waitForTurnstileToken(params: {
  requestId?: string | null
  /** Deployment settings confirm a widget that may mount after document readiness. */
  expectTurnstile?: boolean
  timeoutMs?: unknown
  preTrigger?: TurnstilePreTrigger
  userAssist?: TurnstileUserAssist
}): Promise<TurnstileTokenWaitResult> {
  let detection = detectTurnstileWidget()

  const preTriggerEnabled = Boolean(
    params.preTrigger && params.preTrigger.kind !== "none",
  )
  const assist = params.userAssist

  const existing = readTurnstileTokenFromDom()
  if (existing) {
    clearTurnstileGuardState(params.requestId)
    return {
      status: TURNSTILE_TOKEN_WAIT_STATUSES.TokenObtained,
      token: existing,
      detection,
    }
  }

  const initialPageToken = await readAssistedPageToken(assist, false)
  if (initialPageToken) {
    clearTurnstileGuardState(params.requestId)
    return {
      status: TURNSTILE_TOKEN_WAIT_STATUSES.TokenObtained,
      token: initialPageToken,
      detection,
    }
  }

  if (
    !detection.hasTurnstile &&
    !preTriggerEnabled &&
    params.expectTurnstile !== true
  ) {
    clearTurnstileGuardState(params.requestId)
    return {
      status: TURNSTILE_TOKEN_WAIT_STATUSES.NotPresent,
      token: null,
      detection,
    }
  }

  const timeoutMs = normalizeTimeoutMs(params.timeoutMs)
  const startedAt = Date.now()
  let deadline = startedAt + timeoutMs
  const autoAttemptMs = assist
    ? Math.min(
        timeoutMs,
        normalizeAssistDelay(assist.autoAttemptMs, TURNSTILE_AUTO_ASSIST_MS),
      )
    : timeoutMs
  const assistAt = startedAt + autoAttemptMs
  const pageTokenIntervalMs = normalizeAssistDelay(
    assist?.pageTokenIntervalMs,
    TURNSTILE_PAGE_API_POLL_MS,
  )
  let assistRequested = false
  let assistDeclined = false
  let lastPageTokenReadAt = 0
  let sawTurnstile = detection.hasTurnstile
  // Set while the assist waits for its turn in front of the user, so the wait can
  // outlast the normal timeout without blocking token detection.
  let assistPendingUntil: number | null = null
  const manualWindow = createVerificationManualWindow(
    assist ? params.requestId : undefined,
  )
  const activeDeadline = () =>
    Math.max(deadline, assistPendingUntil ?? 0, manualWindow.getDeadline())

  try {
    while (Date.now() < activeDeadline()) {
      const token = readTurnstileTokenFromDom()
      if (token) {
        detection = detectTurnstileWidget()
        clearTurnstileGuardState(params.requestId)
        return {
          status: TURNSTILE_TOKEN_WAIT_STATUSES.TokenObtained,
          token,
          detection,
        }
      }

      const now = Date.now()
      if (
        assist?.readPageToken &&
        now - lastPageTokenReadAt >= pageTokenIntervalMs
      ) {
        lastPageTokenReadAt = now
        const pageToken = await readAssistedPageToken(assist, sawTurnstile)
        if (pageToken) {
          detection = detectTurnstileWidget()
          clearTurnstileGuardState(params.requestId)
          return {
            status: TURNSTILE_TOKEN_WAIT_STATUSES.TokenObtained,
            token: pageToken,
            detection,
          }
        }
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

      if (
        assist &&
        !assistRequested &&
        !assistDeclined &&
        sawTurnstile &&
        Date.now() >= assistAt
      ) {
        assistRequested = true
        // The assist can wait for its turn behind another verification window, and
        // the widget may still resolve on its own while it waits. Keep polling for
        // a token instead of blocking until the presentation settles.
        assistPendingUntil = Date.now() + TURNSTILE_ASSIST_TURN_WAIT_MS
        const manualWindowMs = Math.max(
          timeoutMs,
          normalizeAssistDelay(
            assist.manualTimeoutMs,
            TURNSTILE_MANUAL_WAIT_MS,
          ),
        )
        void Promise.resolve()
          .then(() => assist.requestAssist())
          .then(
            (accepted) => accepted !== false,
            () => true,
          )
          .then((accepted) => {
            assistPendingUntil = null
            if (!accepted) {
              assistDeclined = true
              return
            }
            // The window only reaches the user now, so the manual window they need
            // to finish the challenge starts here.
            deadline = Math.max(deadline, Date.now() + manualWindowMs)
          })
        continue
      }

      await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_INTERVAL_MS))
    }

    detection = detectTurnstileWidget()
    clearTurnstileGuardState(params.requestId)

    if (!sawTurnstile) {
      return {
        status: TURNSTILE_TOKEN_WAIT_STATUSES.NotPresent,
        token: null,
        detection,
      }
    }

    return {
      status: TURNSTILE_TOKEN_WAIT_STATUSES.Timeout,
      token: null,
      detection,
    }
  } finally {
    manualWindow.dispose()
  }
}
