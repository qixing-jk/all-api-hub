import { afterEach, describe, expect, it, vi } from "vitest"

import { buildTimedRequestSignal } from "~/services/apiService/requestTimeout"

describe("request timeout signal helper", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not create a signal when no caller signal or explicit timeout is provided", () => {
    vi.useFakeTimers()

    const requestSignal = buildTimedRequestSignal()

    expect(requestSignal.signal).toBeUndefined()
    expect(requestSignal.isTimedOut()).toBe(false)

    vi.advanceTimersByTime(30_000)

    expect(requestSignal.isTimedOut()).toBe(false)
    requestSignal.cleanup()
  })

  it("creates an abort signal when an explicit timeout is provided", async () => {
    vi.useFakeTimers()

    const requestSignal = buildTimedRequestSignal({ timeoutMs: 25 })

    expect(requestSignal.signal).toBeInstanceOf(AbortSignal)
    expect(requestSignal.signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(25)

    expect(requestSignal.signal?.aborted).toBe(true)
    expect(requestSignal.isTimedOut()).toBe(true)
    requestSignal.cleanup()
  })
})
