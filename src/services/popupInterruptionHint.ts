import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  getLocalStorage,
  removeLocalStorage,
  setLocalStorage,
} from "~/utils/browser/browserApi"
import { isDevelopmentMode, isTestMode } from "~/utils/core/environment"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("PopupInterruptionHint")

export const POPUP_CRITICAL_FLOWS = {
  AccountAutoDetect: "account-auto-detect",
} as const

export type PopupCriticalFlow =
  (typeof POPUP_CRITICAL_FLOWS)[keyof typeof POPUP_CRITICAL_FLOWS]

export interface PopupInterruptionHint {
  flow: PopupCriticalFlow
  status: "pending"
  startedAt: number
  interruptedAt: number
  ownerId?: string
}

interface ActivePopupCriticalFlow {
  flow: PopupCriticalFlow
  status: "active"
  startedAt: number
  ownerId?: string
  leaseName?: string
}

type PopupInterruptionState = ActivePopupCriticalFlow | PopupInterruptionHint

let activeFlow: ActivePopupCriticalFlow | null = null
let releaseActiveFlow: (() => void) | null = null

/** Holds a browser-owned lease only while the originating popup flow exists. */
async function acquireFlowLease(ownerId: string): Promise<string | undefined> {
  const locks = globalThis.navigator?.locks
  if (typeof locks?.request !== "function") return undefined
  const leaseName = `${STORAGE_LOCKS.POPUP_CRITICAL_FLOW_PREFIX}${ownerId}`
  const released = new Promise<void>((resolve) => {
    releaseActiveFlow = resolve
  })
  await new Promise<void>((resolve, reject) => {
    void locks
      .request(leaseName, () => {
        resolve()
        return released
      })
      .catch(reject)
  })
  return leaseName
}

/** Probes the lease without waiting for a still-running popup to finish. */
async function isFlowAlive(state: ActivePopupCriticalFlow): Promise<boolean> {
  if (activeFlow?.ownerId && activeFlow.ownerId === state.ownerId) return true
  if (!state.leaseName) return false
  const locks = globalThis.navigator?.locks
  // Without a probe, avoid claiming that a lease-backed flow was interrupted.
  if (typeof locks?.request !== "function") return true
  return locks.request(state.leaseName, { ifAvailable: true }, (lock) => !lock)
}

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
    candidate.flow === POPUP_CRITICAL_FLOWS.AccountAutoDetect &&
    candidate.status === "pending" &&
    typeof candidate.startedAt === "number" &&
    typeof candidate.interruptedAt === "number" &&
    (candidate.ownerId === undefined || typeof candidate.ownerId === "string")
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
    candidate.flow === POPUP_CRITICAL_FLOWS.AccountAutoDetect &&
    candidate.status === "active" &&
    typeof candidate.startedAt === "number" &&
    (candidate.ownerId === undefined ||
      typeof candidate.ownerId === "string") &&
    (candidate.leaseName === undefined ||
      (typeof candidate.leaseName === "string" &&
        candidate.leaseName.startsWith(
          STORAGE_LOCKS.POPUP_CRITICAL_FLOW_PREFIX,
        )))
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
    | { flow: PopupCriticalFlow; startedAt: number; ownerId?: string },
): PopupInterruptionHint {
  return {
    flow: flow.flow,
    status: "pending",
    startedAt: flow.startedAt,
    interruptedAt: now(),
    ...(flow.ownerId ? { ownerId: flow.ownerId } : {}),
  }
}

/**
 * Marks a popup-only critical flow as active before it starts asynchronous work.
 */
export async function startPopupCriticalFlow(flow: PopupCriticalFlow) {
  releaseActiveFlow?.()
  releaseActiveFlow = null
  const ownerId = crypto.randomUUID()
  activeFlow = {
    flow,
    status: "active",
    startedAt: now(),
    ownerId,
  }

  try {
    const leaseName = await acquireFlowLease(ownerId)
    if (leaseName) activeFlow.leaseName = leaseName
    const state = activeFlow
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
      () => writePopupInterruptionState(state),
    )
  } catch (error) {
    logger.warn("Failed to persist active popup flow", error)
  }
}

/**
 * Clears a popup-only critical flow after it reaches a normal terminal state.
 */
export async function completePopupCriticalFlow(flow: PopupCriticalFlow) {
  const completed = activeFlow
  const releaseCompleted = releaseActiveFlow
  if (activeFlow?.flow === flow) {
    activeFlow = null
    releaseActiveFlow = null
  }

  try {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
      async () => {
        const current = await readPopupInterruptionState()
        if (
          completed?.flow === flow &&
          current?.flow === flow &&
          current.ownerId === completed.ownerId
        ) {
          await removeLocalStorage(STORAGE_KEYS.POPUP_INTERRUPTION_HINT)
        }
      },
    )
  } catch (error) {
    logger.warn("Failed to clear active popup flow", error)
  } finally {
    if (completed?.flow === flow) releaseCompleted?.()
  }
}

/**
 * Converts the in-memory active flow into a pending hint during popup teardown.
 */
export async function markPopupClosedDuringCriticalFlow() {
  if (!activeFlow) {
    return
  }

  const closed = activeFlow
  activeFlow = null
  releaseActiveFlow?.()
  releaseActiveFlow = null
  try {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
      async () => {
        const current = await readPopupInterruptionState()
        if (
          !current ||
          (isActivePopupCriticalFlow(current) &&
            current.ownerId === closed.ownerId)
        ) {
          await writePopupInterruptionState(createPendingHint(closed))
        }
      },
    )
  } catch (error) {
    logger.warn("Failed to persist popup interruption hint", error)
  }
}

/**
 * Returns a pending interruption hint, converting abandoned active flows when needed.
 */
export async function getPopupInterruptionHint() {
  try {
    return await withExtensionStorageWriteLock(
      STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
      async () => {
        const state = await readPopupInterruptionState()
        if (isPopupInterruptionHint(state)) {
          return state
        }

        if (isActivePopupCriticalFlow(state)) {
          if (await isFlowAlive(state)) return null
          const pendingHint = createPendingHint(state)
          await writePopupInterruptionState(pendingHint)
          return pendingHint
        }

        return null
      },
    )
  } catch (error) {
    logger.warn("Failed to read popup interruption hint", error)
    return null
  }
}

/**
 * Dismisses the pending popup interruption hint.
 */
export async function clearPopupInterruptionHint(
  expected?: PopupInterruptionHint,
) {
  try {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
      async () => {
        const current = await readPopupInterruptionState()
        if (
          isPopupInterruptionHint(current) &&
          (!expected ||
            (current.ownerId === expected.ownerId &&
              current.startedAt === expected.startedAt &&
              current.interruptedAt === expected.interruptedAt))
        ) {
          await removeLocalStorage(STORAGE_KEYS.POPUP_INTERRUPTION_HINT)
        }
      },
    )
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
  flow: PopupCriticalFlow = POPUP_CRITICAL_FLOWS.AccountAutoDetect,
) {
  ensureDebugAvailable("popupInterruptionHint:debugQueue")

  const timestamp = now()
  activeFlow = null
  releaseActiveFlow?.()
  releaseActiveFlow = null

  await withExtensionStorageWriteLock(
    STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
    () =>
      writePopupInterruptionState({
        flow,
        status: "pending",
        startedAt: timestamp,
        interruptedAt: timestamp,
      }),
  )
}
