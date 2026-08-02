export const BROWSER_FOCUS_STATES = {
  Focused: "focused",
  Unfocused: "unfocused",
  Unknown: "unknown",
} as const

export type BrowserFocusState =
  (typeof BROWSER_FOCUS_STATES)[keyof typeof BROWSER_FOCUS_STATES]

export const BROWSER_FOCUS_TRANSITIONS = {
  RemainedFocused: "remained_focused",
  RemainedUnfocused: "remained_unfocused",
  Foregrounded: "foregrounded",
  Backgrounded: "backgrounded",
  Mixed: "mixed",
  Unknown: "unknown",
} as const

export type BrowserFocusTransition =
  (typeof BROWSER_FOCUS_TRANSITIONS)[keyof typeof BROWSER_FOCUS_TRANSITIONS]

export interface BrowserFocusObservation {
  start: BrowserFocusState
  transition: BrowserFocusTransition
  end: BrowserFocusState
}

type FocusedWindow = {
  id?: unknown
  focused?: unknown
}

type FocusChangedEvent = {
  addListener?: (listener: (windowId: number) => void) => void
  removeListener?: (listener: (windowId: number) => void) => void
}

type BrowserWindowsApi = {
  getLastFocused?: (getInfo: Record<string, never>) => Promise<FocusedWindow>
  onFocusChanged?: FocusChangedEvent
  WINDOW_ID_NONE?: unknown
}

type BrowserApiGlobals = {
  browser?: { windows?: BrowserWindowsApi }
  chrome?: { windows?: BrowserWindowsApi }
}

// The local browser API normally resolves immediately. One second tolerates a
// delayed service-worker response without blocking protection bypass work.
const BROWSER_FOCUS_READ_TIMEOUT_MS = 1_000

/** Gets the optional browser windows API without requiring it at runtime. */
function getBrowserWindowsApi(): BrowserWindowsApi | undefined {
  const browserGlobals = globalThis as BrowserApiGlobals
  return browserGlobals.browser?.windows ?? browserGlobals.chrome?.windows
}

/** Narrows a focus classification to a browser-confirmed state. */
function isKnownFocusState(
  state: BrowserFocusState,
): state is Exclude<BrowserFocusState, "unknown"> {
  return state !== BROWSER_FOCUS_STATES.Unknown
}

/**
 * Samples only the current focused-state classification. Window identifiers
 * are intentionally discarded at this boundary.
 */
export async function readBrowserFocusState(): Promise<BrowserFocusState> {
  let timeoutId: number | undefined

  try {
    const getLastFocused = getBrowserWindowsApi()?.getLastFocused
    if (typeof getLastFocused !== "function") {
      return BROWSER_FOCUS_STATES.Unknown
    }

    const window = await Promise.race([
      getLastFocused({}),
      new Promise<undefined>((resolve) => {
        timeoutId = setTimeout(resolve, BROWSER_FOCUS_READ_TIMEOUT_MS)
      }),
    ])
    if (
      !window ||
      typeof window.id !== "number" ||
      typeof window.focused !== "boolean"
    ) {
      return BROWSER_FOCUS_STATES.Unknown
    }

    return window.focused
      ? BROWSER_FOCUS_STATES.Focused
      : BROWSER_FOCUS_STATES.Unfocused
  } catch {
    return BROWSER_FOCUS_STATES.Unknown
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

interface BrowserFocusTransitionTracker {
  note: (state: BrowserFocusState) => void
  finish: (end: BrowserFocusState) => BrowserFocusTransition
}

/**
 * Reduces focus samples to two directional flags and a current state, keeping
 * no window ids, timestamps, or raw focus-event history.
 */
export function createBrowserFocusTransitionTracker(
  start: BrowserFocusState,
): BrowserFocusTransitionTracker {
  let current = start
  let sawForegrounded = false
  let sawBackgrounded = false
  let finalTransition: BrowserFocusTransition | undefined

  const note = (state: BrowserFocusState) => {
    if (
      finalTransition ||
      !isKnownFocusState(current) ||
      !isKnownFocusState(state)
    ) {
      return
    }

    if (
      current === BROWSER_FOCUS_STATES.Unfocused &&
      state === BROWSER_FOCUS_STATES.Focused
    ) {
      sawForegrounded = true
    }

    if (
      current === BROWSER_FOCUS_STATES.Focused &&
      state === BROWSER_FOCUS_STATES.Unfocused
    ) {
      sawBackgrounded = true
    }

    current = state
  }

  const finish = (end: BrowserFocusState): BrowserFocusTransition => {
    if (finalTransition) {
      return finalTransition
    }

    if (!isKnownFocusState(start) || !isKnownFocusState(end)) {
      finalTransition = BROWSER_FOCUS_TRANSITIONS.Unknown
      return finalTransition
    }

    if (isKnownFocusState(current)) {
      if (
        current === BROWSER_FOCUS_STATES.Unfocused &&
        end === BROWSER_FOCUS_STATES.Focused
      ) {
        sawForegrounded = true
      }

      if (
        current === BROWSER_FOCUS_STATES.Focused &&
        end === BROWSER_FOCUS_STATES.Unfocused
      ) {
        sawBackgrounded = true
      }
    }

    if (sawForegrounded && sawBackgrounded) {
      finalTransition = BROWSER_FOCUS_TRANSITIONS.Mixed
    } else if (sawForegrounded) {
      finalTransition = BROWSER_FOCUS_TRANSITIONS.Foregrounded
    } else if (sawBackgrounded) {
      finalTransition = BROWSER_FOCUS_TRANSITIONS.Backgrounded
    } else if (start === BROWSER_FOCUS_STATES.Focused) {
      finalTransition = BROWSER_FOCUS_TRANSITIONS.RemainedFocused
    } else {
      finalTransition = BROWSER_FOCUS_TRANSITIONS.RemainedUnfocused
    }

    return finalTransition
  }

  return { note, finish }
}

export interface BrowserFocusObservationController {
  finish: () => Promise<BrowserFocusObservation>
  cancel: () => void
}

/**
 * Observes a bounded interval. Event subscription failures make the interval
 * incomplete rather than allowing start/end samples to imply a transition.
 */
export function createBrowserFocusObservation(
  start: BrowserFocusState,
): BrowserFocusObservationController {
  const tracker = createBrowserFocusTransitionTracker(start)
  const windowsApi = getBrowserWindowsApi()
  const focusChanged = windowsApi?.onFocusChanged
  const addFocusListener = focusChanged?.addListener
  const removeFocusListener = focusChanged?.removeListener
  let listenerRegistered = false
  let removalInProgress = false
  let acceptingEvents = true
  let incomplete = false
  let cancelled = false
  let finalObservation: Promise<BrowserFocusObservation> | undefined

  const listener = (windowId: number) => {
    if (!acceptingEvents) {
      return
    }

    if (typeof windowId !== "number") {
      tracker.note(BROWSER_FOCUS_STATES.Unknown)
      return
    }

    const windowIdNone =
      typeof windowsApi?.WINDOW_ID_NONE === "number"
        ? windowsApi.WINDOW_ID_NONE
        : -1
    tracker.note(
      windowId === windowIdNone
        ? BROWSER_FOCUS_STATES.Unfocused
        : BROWSER_FOCUS_STATES.Focused,
    )
  }

  const removeListener = () => {
    if (!listenerRegistered || removalInProgress) {
      return true
    }

    removalInProgress = true
    try {
      removeFocusListener?.call(focusChanged, listener)
      listenerRegistered = false
      return true
    } catch {
      incomplete = true
      return false
    } finally {
      removalInProgress = false
    }
  }

  if (
    typeof addFocusListener !== "function" ||
    typeof removeFocusListener !== "function"
  ) {
    incomplete = true
  } else {
    try {
      addFocusListener.call(focusChanged, listener)
      listenerRegistered = true
    } catch {
      incomplete = true
    }
  }

  const finish = (): Promise<BrowserFocusObservation> => {
    if (!finalObservation) {
      finalObservation = Promise.resolve().then(async () => {
        removeListener()
        let end: BrowserFocusState = BROWSER_FOCUS_STATES.Unknown
        try {
          end = await readBrowserFocusState()
        } finally {
          // Retry once after sampling if a prior removal was interrupted.
          removeListener()
        }

        return {
          start,
          transition:
            incomplete || cancelled
              ? BROWSER_FOCUS_TRANSITIONS.Unknown
              : tracker.finish(end),
          end,
        }
      })
      acceptingEvents = false
    }

    return finalObservation
  }

  const cancel = () => {
    if (!cancelled) {
      cancelled = true
      incomplete = true
      acceptingEvents = false
    }

    removeListener()
  }

  return { finish, cancel }
}
