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
