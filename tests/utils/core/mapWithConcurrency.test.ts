import { describe, expect, it, vi } from "vitest"

import { mapWithConcurrency } from "~/utils/core/mapWithConcurrency"
import { createDeferred } from "~~/tests/test-utils/deferred"

describe("bounded reads", () => {
  it("drains active reads before rejecting and does not start queued work", async () => {
    const first = createDeferred<number>()
    const second = createDeferred<number>()
    const mapper = vi.fn((value: number) =>
      value === 1 ? first.promise : second.promise,
    )
    const result = mapWithConcurrency([1, 2, 3], 2, mapper)
    const failure = new Error("unavailable")
    let settled = false
    const rejection = expect(
      result.finally(() => {
        settled = true
      }),
    ).rejects.toBe(failure)
    first.reject(failure)
    await expect(first.promise).rejects.toBe(failure)
    expect(settled).toBe(false)
    expect(mapper).toHaveBeenCalledTimes(2)
    second.resolve(2)
    await rejection
    expect(mapper).toHaveBeenCalledTimes(2)
  })
  it("stops queued reads on cancellation and drains active work", async () => {
    const controller = new AbortController()
    const gate = createDeferred<number>()
    const mapper = vi.fn(() => gate.promise)
    const result = mapWithConcurrency([1, 2, 3], 2, mapper, {
      signal: controller.signal,
    })
    const rejection = expect(result).rejects.toMatchObject({
      name: "AbortError",
    })
    controller.abort()
    gate.resolve(7)
    await rejection
    expect(mapper).toHaveBeenCalledTimes(2)
  })
  it("rejects a cancelled operation before dispatching reads", async () => {
    const controller = new AbortController()
    controller.abort()
    const mapper = vi.fn()
    await expect(
      mapWithConcurrency([1], 2, mapper, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(mapper).not.toHaveBeenCalled()
  })
})
