import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  subscribeToAllowanceClock,
  useAllowanceClock,
} from "~/features/ApiCredentialProfiles/hooks/useAllowanceClock"

const MINUTE_MS = 60_000

describe("useAllowanceClock", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-03T08:00:30.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the start of the current minute so the value changes once a minute", () => {
    const { result } = renderHook(() => useAllowanceClock())

    expect(result.current).toBe(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS)
  })

  it("notifies subscribers on the shared tick without drifting per subscriber", () => {
    const first = vi.fn()
    const second = vi.fn()

    const unsubscribeFirst = subscribeToAllowanceClock(first)
    const unsubscribeSecond = subscribeToAllowanceClock(second)

    act(() => {
      vi.advanceTimersByTime(MINUTE_MS)
    })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    unsubscribeFirst()
    unsubscribeSecond()
  })

  it("stops the ticker once the last subscriber unsubscribes", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToAllowanceClock(listener)

    act(() => {
      vi.advanceTimersByTime(MINUTE_MS)
    })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()

    act(() => {
      vi.advanceTimersByTime(MINUTE_MS * 3)
    })

    // The cleared interval must not keep firing for a listener that left, and
    // the next subscription has to start a fresh one on its own.
    expect(listener).toHaveBeenCalledTimes(1)

    const restarted = vi.fn()
    const unsubscribeRestarted = subscribeToAllowanceClock(restarted)
    act(() => {
      vi.advanceTimersByTime(MINUTE_MS)
    })
    expect(restarted).toHaveBeenCalledTimes(1)

    unsubscribeRestarted()
  })

  it("re-renders a subscribed component when the minute rolls over", () => {
    const { result } = renderHook(() => useAllowanceClock())
    const initial = result.current

    act(() => {
      vi.advanceTimersByTime(MINUTE_MS)
    })

    expect(result.current).toBe(initial + MINUTE_MS)
  })
})
