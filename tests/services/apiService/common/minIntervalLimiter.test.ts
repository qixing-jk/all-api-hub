import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createMinIntervalLimiter } from "~/services/apiService/common/minIntervalLimiter"

describe("createMinIntervalLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("delays calls for the same key to enforce the minimum interval", async () => {
    const limiter = createMinIntervalLimiter({ minIntervalMs: 200 })

    await limiter("site-a")

    const onResolved = vi.fn()
    const promise = limiter("site-a").then(onResolved)

    vi.advanceTimersByTime(199)
    await Promise.resolve()
    expect(onResolved).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await expect(promise).resolves.toBeUndefined()
    expect(onResolved).toHaveBeenCalledTimes(1)
  })

  it("does not block different keys", async () => {
    const limiter = createMinIntervalLimiter({ minIntervalMs: 200 })

    await limiter("site-a")

    const onAResolved = vi.fn()
    const onBResolved = vi.fn()

    const promiseA = limiter("site-a").then(onAResolved)
    const promiseB = limiter("site-b").then(onBResolved)

    await expect(promiseB).resolves.toBeUndefined()
    expect(onBResolved).toHaveBeenCalledTimes(1)
    expect(onAResolved).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    await expect(promiseA).resolves.toBeUndefined()
    expect(onAResolved).toHaveBeenCalledTimes(1)
  })

  it("treats non-positive minIntervalMs as disabled", async () => {
    const limiter = createMinIntervalLimiter({ minIntervalMs: 0 })

    await limiter("site-a")
    await limiter("site-a")

    expect(vi.getTimerCount()).toBe(0)
  })
})
