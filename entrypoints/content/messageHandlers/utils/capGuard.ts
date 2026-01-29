import { createLogger } from "~/utils/logger"
import { sanitizeUrlForLog } from "~/utils/sanitizeUrlForLog"

const logger = createLogger("CapGuard")

export type CapChallengeDetection = {
  isChallenge: boolean
  score: number
  reasons: string[]
  title: string
  url: string | null
  apiEndpoint: string | null
}

type CapAutoStartAttempt = {
  attempted: boolean
  method: "click" | "none"
  reason: string
}

type CapAutoStartState = {
  attempts: number
  lastAttemptAt: number
}

const CAP_AUTOSTART_MIN_INTERVAL_MS = 1000
const CAP_AUTOSTART_MAX_ATTEMPTS = 3

/**
 *
 */
function getCapAutoStartStateMap(): Map<string, CapAutoStartState> {
  const globalAny = globalThis as any
  if (!globalAny.__aahCapAutoStartState) {
    globalAny.__aahCapAutoStartState = new Map<string, CapAutoStartState>()
  }
  return globalAny.__aahCapAutoStartState as Map<string, CapAutoStartState>
}

/**
 * Clears any stored auto-start throttling state for a request.
 *
 * This is a best-effort cleanup to avoid keeping per-request state around after
 * the checkpoint is cleared or the request is otherwise finished.
 */
export function clearCapAutoStartState(requestId?: string | null): void {
  const normalized = (requestId || "").trim()
  if (!normalized) return
  try {
    getCapAutoStartStateMap().delete(normalized)
  } catch {
    // ignore
  }
}

/**
 * Detect whether the current page looks like a CAP (cap.js) checkpoint page.
 *
 * This detector is intentionally conservative and only uses stable DOM markers:
 * - Presence of a `<cap-widget>` custom element
 * - (Optional) `data-cap-api-endpoint` attribute to improve confidence
 *
 * The result is used by the temp-context readiness gate to avoid replaying
 * requests before the browser has earned the `__cap_clearance` cookie.
 */
export function detectCapChallengePage(): CapChallengeDetection {
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

  const capWidget = (() => {
    try {
      return document.querySelector("cap-widget") as HTMLElement | null
    } catch {
      return null
    }
  })()

  const hasCapWidget = Boolean(capWidget)
  if (hasCapWidget) {
    score += 3
    reasons.push("cap-widget")
  }

  const apiEndpoint = (() => {
    try {
      if (!capWidget) return null
      const raw = capWidget.getAttribute("data-cap-api-endpoint")
      return raw && raw.trim() ? raw.trim() : null
    } catch {
      return null
    }
  })()

  if (apiEndpoint) {
    score += 2
    reasons.push("cap-api-endpoint")
  }

  if (apiEndpoint && apiEndpoint.includes("__cap_clearance")) {
    score += 1
    reasons.push("cap-clearance-endpoint")
  }

  const isChallenge = hasCapWidget

  return {
    isChallenge,
    score,
    reasons,
    title,
    url: currentUrl,
    apiEndpoint,
  }
}

/**
 * Simulates a user click on an element.
 *
 * CAP widgets may require pointer/mouse events to start their own verification flow.
 * This helper dispatches a small sequence of events and finally calls `.click()`.
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
    // PointerEvent is not supported in some environments; fall back to MouseEvent.
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
 * Best-effort: locate a clickable inner node for CAP widgets that render their
 * own UI inside an open shadow root.
 *
 * Some CAP integrations expose a stable host id (e.g. `#my-widget`) and attach
 * a small clickable root element inside their shadow DOM. When available, we
 * prefer clicking that inner target to better mimic a user interaction.
 */
function getCapWidgetClickTarget(widget: HTMLElement): HTMLElement {
  const shadowHost = (() => {
    try {
      const byId = document.getElementById("my-widget")
      if (!(byId instanceof HTMLElement)) {
        return widget
      }

      // Only treat #my-widget as the CAP host when it looks like a CAP widget.
      if (byId === widget) return byId
      if (String(byId.tagName || "").toLowerCase() === "cap-widget") return byId
      if (byId.getAttribute("data-cap-api-endpoint")) return byId

      return widget
    } catch {
      return widget
    }
  })()

  const shadowRoot = (shadowHost as any).shadowRoot as
    | ShadowRoot
    | null
    | undefined
  if (!shadowRoot) {
    return widget
  }

  const candidates: string[] = [
    // Known stable selector used by some CAP widget builds.
    "div > div",
    // Generic fallbacks.
    "button",
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    '[tabindex="0"]',
  ]

  for (const selector of candidates) {
    try {
      const el = shadowRoot.querySelector(selector)
      if (el instanceof HTMLElement) {
        return el
      }
    } catch {
      // ignore invalid selectors or shadowRoot query errors
    }
  }

  return widget
}

/**
 * Best-effort: start the CAP widget flow for a request.
 *
 * - Simulates a click on a stable CAP widget element (inner shadow-root target
 *   when available, otherwise the `<cap-widget>` host element).
 * - Throttles attempts per request to avoid spamming repeated calls during
 *   background readiness polling.
 */
export function maybeAutoStartCapChallenge(params: {
  requestId?: string | null
  detection?: CapChallengeDetection
}): CapAutoStartAttempt {
  const requestId = (params.requestId || "").trim()
  if (!requestId) {
    return { attempted: false, method: "none", reason: "missingRequestId" }
  }

  const stateMap = getCapAutoStartStateMap()
  const now = Date.now()
  const current = stateMap.get(requestId) ?? { attempts: 0, lastAttemptAt: 0 }

  if (current.attempts >= CAP_AUTOSTART_MAX_ATTEMPTS) {
    return { attempted: false, method: "none", reason: "maxAttempts" }
  }

  if (now - current.lastAttemptAt < CAP_AUTOSTART_MIN_INTERVAL_MS) {
    return { attempted: false, method: "none", reason: "throttled" }
  }

  const widget = (() => {
    try {
      return document.querySelector("cap-widget") as any
    } catch {
      return null
    }
  })()

  if (!widget) {
    return { attempted: false, method: "none", reason: "noWidget" }
  }

  stateMap.set(requestId, {
    attempts: current.attempts + 1,
    lastAttemptAt: now,
  })

  const endpointForLog =
    params.detection?.apiEndpoint ??
    widget?.getAttribute?.("data-cap-api-endpoint")

  try {
    const target = getCapWidgetClickTarget(widget as HTMLElement)
    simulateClick(target)
    logger.debug("CAP auto-start via click()", {
      requestId,
      apiEndpoint: endpointForLog
        ? sanitizeUrlForLog(String(endpointForLog))
        : null,
      url: params.detection?.url
        ? sanitizeUrlForLog(params.detection.url)
        : null,
    })
    return { attempted: true, method: "click", reason: "clicked" }
  } catch {
    return { attempted: false, method: "none", reason: "unexpectedError" }
  }
}
