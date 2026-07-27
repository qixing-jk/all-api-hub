import { afterEach, describe, expect, it, vi } from "vitest"

import {
  composeAbortSignals,
  createDeferredAbortDeadline,
  runAbortableTask,
  startAbortableTask,
} from "~/services/apiTransport/abortableTask"

afterEach(() => {
  vi.useRealTimers()
})

describe("runAbortableTask", () => {
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

  it.each([
    undefined,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])(
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
    const firstReason = new DOMException("First cancelled", "AbortError")
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
    firstController.abort(firstReason)

    await rejection
    expect(receivedSignal?.reason).toBe(secondReason)
    expect(firstController.signal.reason).toBe(firstReason)
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

describe("startAbortableTask", () => {
  it("settles completion without starting work for a pre-aborted signal", async () => {
    const controller = new AbortController()
    const reason = new DOMException("Cancelled", "AbortError")
    const task = vi.fn(async () => "unexpected")
    controller.abort(reason)

    const execution = startAbortableTask(task, {
      signals: [controller.signal],
    })

    await expect(execution.result).rejects.toBe(reason)
    await expect(execution.completion).resolves.toBeUndefined()
    expect(task).not.toHaveBeenCalled()
  })

  it("settles completion after a synchronous fast-path failure", async () => {
    const taskError = new Error("synchronous failure")
    const execution = startAbortableTask(() => {
      throw taskError
    })

    await expect(execution.result).rejects.toBe(taskError)
    await expect(execution.completion).resolves.toBeUndefined()
  })

  it("reports timeout before signal-ignoring work actually completes", async () => {
    vi.useFakeTimers()
    let completeTask: ((value: string) => void) | undefined
    const execution = startAbortableTask(
      () =>
        new Promise<string>((resolve) => {
          completeTask = resolve
        }),
      { timeoutMs: 1_000 },
    )
    let completionSettled = false
    void execution.completion.then(() => {
      completionSettled = true
    })
    const rejection = expect(execution.result).rejects.toMatchObject({
      name: "TimeoutError",
    })

    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
    expect(completionSettled).toBe(false)

    completeTask?.("late result")
    await execution.completion
    expect(completionSettled).toBe(true)
  })

  it("waits for completion and consumes a late task rejection after timeout", async () => {
    vi.useFakeTimers()
    const lateError = new Error("late failure")
    let rejectTask: ((reason: unknown) => void) | undefined
    const execution = startAbortableTask(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectTask = reject
        }),
      { timeoutMs: 1_000 },
    )
    const timeoutRejection = expect(execution.result).rejects.toMatchObject({
      name: "TimeoutError",
    })
    let completionSettled = false
    void execution.completion.then(() => {
      completionSettled = true
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await timeoutRejection
    expect(completionSettled).toBe(false)

    rejectTask?.(lateError)
    await execution.completion
    expect(completionSettled).toBe(true)
  })
})

describe("createDeferredAbortDeadline", () => {
  it.each([
    undefined,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("does not arm a timer for timeoutMs=%s", async (timeoutMs) => {
    vi.useFakeTimers()
    const deadline = createDeferredAbortDeadline(timeoutMs)

    deadline.start()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(deadline.signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    deadline.dispose()
  })

  it("starts a deferred deadline once without resetting its timeout", async () => {
    vi.useFakeTimers()
    const deadline = createDeferredAbortDeadline(1_000)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(deadline.signal.aborted).toBe(false)

    deadline.start()
    await vi.advanceTimersByTimeAsync(900)
    deadline.start()
    await vi.advanceTimersByTimeAsync(99)
    expect(deadline.signal.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(deadline.signal.reason).toMatchObject({ name: "TimeoutError" })
    deadline.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("disposes a deferred deadline before it aborts", async () => {
    vi.useFakeTimers()
    const deadline = createDeferredAbortDeadline(1_000)

    deadline.start()
    deadline.dispose()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(deadline.signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("composeAbortSignals", () => {
  it("composes queue cancellation without starting a deferred deadline", async () => {
    vi.useFakeTimers()
    const externalController = new AbortController()
    const deadline = createDeferredAbortDeadline(1_000)
    const removeExternalListener = vi.spyOn(
      externalController.signal,
      "removeEventListener",
    )
    const removeDeadlineListener = vi.spyOn(
      deadline.signal,
      "removeEventListener",
    )
    const composed = composeAbortSignals([
      externalController.signal,
      deadline.signal,
    ])

    await vi.advanceTimersByTimeAsync(1_000)
    expect(composed.signal?.aborted).toBe(false)

    deadline.start()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(composed.signal?.reason).toMatchObject({ name: "TimeoutError" })

    composed.dispose()
    deadline.dispose()
    expect(removeExternalListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    )
    expect(removeDeadlineListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    )
  })

  it("immediately relays the first pre-aborted source and cleans earlier listeners", () => {
    const liveController = new AbortController()
    const firstAbortedController = new AbortController()
    const laterAbortedController = new AbortController()
    const firstReason = new DOMException("First cancelled", "AbortError")
    const laterReason = new DOMException("Later cancelled", "AbortError")
    const removeLiveListener = vi.spyOn(
      liveController.signal,
      "removeEventListener",
    )
    firstAbortedController.abort(firstReason)
    laterAbortedController.abort(laterReason)

    const composed = composeAbortSignals([
      liveController.signal,
      firstAbortedController.signal,
      laterAbortedController.signal,
    ])

    expect(composed.signal?.aborted).toBe(true)
    expect(composed.signal?.reason).toBe(firstReason)

    composed.dispose()
    expect(removeLiveListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    )
  })
})
