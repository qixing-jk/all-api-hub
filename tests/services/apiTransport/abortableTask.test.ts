import { afterEach, describe, expect, it, vi } from "vitest"

import { runAbortableTask } from "~/services/apiTransport/abortableTask"

describe("runAbortableTask", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not execute work when a source signal is already aborted", async () => {
    const controller = new AbortController()
    const reason = new DOMException("Cancelled", "AbortError")
    const task = vi.fn(async () => "unexpected")
    controller.abort(reason)

    await expect(
      runAbortableTask(task, { signals: [controller.signal] }),
    ).rejects.toBe(reason)
    expect(task).not.toHaveBeenCalled()
  })

  it("does not start deferred work when cancellation wins the dispatch race", async () => {
    const controller = new AbortController()
    const reason = new DOMException("Cancelled", "AbortError")
    const task = vi.fn(async () => "unexpected")

    const result = runAbortableTask(task, { signals: [controller.signal] })
    controller.abort(reason)

    await expect(result).rejects.toBe(reason)
    expect(task).not.toHaveBeenCalled()
  })

  it.each([undefined, 0, -1])(
    "uses the fast path without arming a timer for timeoutMs=%s",
    async (timeoutMs) => {
      vi.useFakeTimers()
      const task = vi.fn(async (signal?: AbortSignal) => ({ signal }))

      await expect(runAbortableTask(task, { timeoutMs })).resolves.toEqual({
        signal: undefined,
      })
      expect(task).toHaveBeenCalledWith(undefined)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it("passes successful results through and clears the timeout", async () => {
    vi.useFakeTimers()
    const task = vi.fn(async () => "done")

    await expect(runAbortableTask(task, { timeoutMs: 1_000 })).resolves.toBe(
      "done",
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rejects with the reason from the first of two source signals to abort", async () => {
    const firstController = new AbortController()
    const secondController = new AbortController()
    const secondReason = new DOMException("Second cancelled", "AbortError")
    let receivedSignal: AbortSignal | undefined
    const task = vi.fn(
      (signal?: AbortSignal) =>
        new Promise<string>(() => {
          receivedSignal = signal
        }),
    )

    const result = runAbortableTask(task, {
      signals: [firstController.signal, secondController.signal],
    })
    const rejection = expect(result).rejects.toBe(secondReason)
    await Promise.resolve()
    secondController.abort(secondReason)

    await rejection
    expect(receivedSignal?.reason).toBe(secondReason)
    expect(firstController.signal.aborted).toBe(false)
  })

  it("settles at the timeout when work ignores the composed signal", async () => {
    vi.useFakeTimers()
    let receivedSignal: AbortSignal | undefined
    const task = vi.fn(
      (signal?: AbortSignal) =>
        new Promise<string>(() => {
          receivedSignal = signal
        }),
    )

    const result = runAbortableTask(task, { timeoutMs: 1_000 })
    const rejection = expect(result).rejects.toMatchObject({
      name: "TimeoutError",
    })
    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
    expect(receivedSignal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
