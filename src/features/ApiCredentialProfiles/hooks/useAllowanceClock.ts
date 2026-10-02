import { useSyncExternalStore } from "react"

/**
 * Reset countdowns are the only clock-driven part of the credential library, so
 * they share one module-level ticker instead of one interval per rendered row.
 */
const ALLOWANCE_CLOCK_INTERVAL_MS = 60_000

const listeners = new Set<() => void>()
let intervalId: ReturnType<typeof setInterval> | undefined

/** Subscribes to the shared ticker; exported so tests can drive it directly. */
export function subscribeToAllowanceClock(listener: () => void): () => void {
  listeners.add(listener)

  if (intervalId === undefined) {
    intervalId = setInterval(() => {
      for (const current of listeners) current()
    }, ALLOWANCE_CLOCK_INTERVAL_MS)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && intervalId !== undefined) {
      clearInterval(intervalId)
      intervalId = undefined
    }
  }
}

/** Returns the current minute, so identical renders bail out of re-rendering. */
function getAllowanceClockSnapshot(): number {
  return Math.floor(Date.now() / ALLOWANCE_CLOCK_INTERVAL_MS)
}

/** Returns the initial snapshot used when no browser clock is available. */
function getAllowanceClockServerSnapshot(): number {
  return 0
}

/**
 * Provides a minute-aligned "now" for reset countdowns.
 *
 * The value changes once a minute, which keeps a visible library ticking
 * without each row owning its own timer.
 */
export function useAllowanceClock(): number {
  const minute = useSyncExternalStore(
    subscribeToAllowanceClock,
    getAllowanceClockSnapshot,
    getAllowanceClockServerSnapshot,
  )
  return minute * ALLOWANCE_CLOCK_INTERVAL_MS
}
