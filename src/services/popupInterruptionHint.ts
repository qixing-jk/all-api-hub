import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  getLocalStorage,
  removeLocalStorage,
  setLocalStorage,
} from "~/utils/browser/browserApi"
import { isDevelopmentMode, isTestMode } from "~/utils/core/environment"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("PopupInterruptionHint")

export type PopupCriticalFlow = "account-auto-detect"

export interface PopupInterruptionHint {
  flow: PopupCriticalFlow
  status: "pending"
  startedAt: number
  interruptedAt: number
}

interface ActivePopupCriticalFlow {
  flow: PopupCriticalFlow
  status: "active"
  startedAt: number
}

type PopupInterruptionState = ActivePopupCriticalFlow | PopupInterruptionHint

let activeFlow: {
  flow: PopupCriticalFlow
  startedAt: number
} | null = null

/**
 * Returns the current timestamp for persisted popup interruption records.
 */
function now() {
  return Date.now()
}

/**
 * Validates persisted pending interruption records before using them.
 */
function isPopupInterruptionHint(
  value: unknown,
): value is PopupInterruptionHint {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<PopupInterruptionHint>
  return (
    candidate.flow === "account-auto-detect" &&
    candidate.status === "pending" &&
    typeof candidate.startedAt === "number" &&
    typeof candidate.interruptedAt === "number"
  )
}

/**
 * Validates persisted active critical-flow records from a previous popup.
 */
function isActivePopupCriticalFlow(
  value: unknown,
): value is ActivePopupCriticalFlow {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<ActivePopupCriticalFlow>
  return (
    candidate.flow === "account-auto-detect" &&
    candidate.status === "active" &&
    typeof candidate.startedAt === "number"
  )
}

/**
 * Reads the current popup interruption state from extension local storage.
 */
async function readPopupInterruptionState() {
  const stored = await getLocalStorage(STORAGE_KEYS.POPUP_INTERRUPTION_HINT)
  const value = stored[STORAGE_KEYS.POPUP_INTERRUPTION_HINT]
  return isPopupInterruptionHint(value) || isActivePopupCriticalFlow(value)
    ? value
    : null
}

/**
 * Persists the active or pending popup interruption state.
 */
async function writePopupInterruptionState(state: PopupInterruptionState) {
  await setLocalStorage({
    [STORAGE_KEYS.POPUP_INTERRUPTION_HINT]: state,
  })
}

/**
 * Builds the pending hint shown on the next extension UI open.
 */
function createPendingHint(
  flow:
    | ActivePopupCriticalFlow
    | { flow: PopupCriticalFlow; startedAt: number },
): PopupInterruptionHint {
  return {
    flow: flow.flow,
    status: "pending",
    startedAt: flow.startedAt,
    interruptedAt: now(),
  }
}

/**
 * Marks a popup-only critical flow as active before it starts asynchronous work.
 */
export async function startPopupCriticalFlow(flow: PopupCriticalFlow) {
  activeFlow = {
    flow,
    startedAt: now(),
  }

  try {
    await writePopupInterruptionState({
      flow,
      status: "active",
      startedAt: activeFlow.startedAt,
    })
  } catch (error) {
    logger.warn("Failed to persist active popup flow", error)
  }
}

/**
 * Clears a popup-only critical flow after it reaches a normal terminal state.
 */
export async function completePopupCriticalFlow(flow: PopupCriticalFlow) {
  if (activeFlow?.flow === flow) {
    activeFlow = null
  }

  try {
    const current = await readPopupInterruptionState()
    if (current?.flow === flow) {
      await clearPopupInterruptionHint()
    }
  } catch (error) {
    logger.warn("Failed to clear active popup flow", error)
  }
}

/**
 * Converts the in-memory active flow into a pending hint during popup teardown.
 */
export async function markPopupClosedDuringCriticalFlow() {
  if (!activeFlow) {
    return
  }

  try {
    await writePopupInterruptionState(createPendingHint(activeFlow))
  } catch (error) {
    logger.warn("Failed to persist popup interruption hint", error)
  }
}

/**
 * Returns a pending interruption hint, converting abandoned active flows when needed.
 */
export async function getPopupInterruptionHint() {
  try {
    const state = await readPopupInterruptionState()
    if (isPopupInterruptionHint(state)) {
      return state
    }

    if (isActivePopupCriticalFlow(state)) {
      const pendingHint = createPendingHint(state)
      await writePopupInterruptionState(pendingHint)
      return pendingHint
    }

    return null
  } catch (error) {
    logger.warn("Failed to read popup interruption hint", error)
    return null
  }
}

/**
 * Dismisses the pending popup interruption hint.
 */
export async function clearPopupInterruptionHint() {
  try {
    await removeLocalStorage(STORAGE_KEYS.POPUP_INTERRUPTION_HINT)
  } catch (error) {
    logger.warn("Failed to clear popup interruption hint", error)
  }
}

/**
 * Rejects direct debug helpers outside development or test runtimes.
 */
function ensureDebugAvailable(action: string) {
  if (!isDevelopmentMode() && !isTestMode()) {
    throw new Error(
      `Debug action is only available in development/test mode (${action})`,
    )
  }
}

/**
 * Queues the popup interruption hint without reproducing popup teardown.
 */
export async function debugQueuePopupInterruptionHint(
  flow: PopupCriticalFlow = "account-auto-detect",
) {
  ensureDebugAvailable("popupInterruptionHint:debugQueue")

  const timestamp = now()
  activeFlow = null

  await writePopupInterruptionState({
    flow,
    status: "pending",
    startedAt: timestamp,
    interruptedAt: timestamp,
  })
}
