import { act, renderHook } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { useBalanceAsOf } from "~/features/AccountManagement/data/useBalanceAsOf"

it("invalidates daily projections at local midnight without an account update", () => {
  vi.useFakeTimers()
  const before = new Date(2026, 10, 18, 23, 59, 59)
  vi.setSystemTime(before)
  const sites: never[] = []
  const { result, unmount } = renderHook(() => useBalanceAsOf(sites))
  try {
    expect(result.current).toBe(before.getTime())
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe(new Date(2026, 10, 19).getTime())
  } finally {
    unmount()
    vi.useRealTimers()
  }
})
