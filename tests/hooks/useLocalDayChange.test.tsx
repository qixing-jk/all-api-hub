import { act, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useLocalDayChange } from "~/hooks/useLocalDayChange"

afterEach(() => vi.useRealTimers())
it("updates once at local midnight and cleans up its timer", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 0, 1, 23, 59, 59))
  const changed = vi.fn()
  const { unmount } = renderHook(() => useLocalDayChange(changed))
  expect(changed).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1000))
  expect(changed).toHaveBeenCalledOnce()
  act(() => window.dispatchEvent(new Event("focus")))
  expect(changed).toHaveBeenCalledOnce()
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it("catches a suspended page crossing days when focus returns without repeated reloads", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 0, 1, 12))
  const changed = vi.fn()
  renderHook(() => useLocalDayChange(changed))
  vi.setSystemTime(new Date(2026, 0, 3, 12))
  act(() => document.dispatchEvent(new Event("visibilitychange")))
  act(() => window.dispatchEvent(new Event("focus")))
  expect(changed).toHaveBeenCalledOnce()
})
