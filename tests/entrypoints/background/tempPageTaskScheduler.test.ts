import { describe, expect, it, vi } from "vitest"

import {
  createTempPageTaskScheduler,
  TEMP_PAGE_TASK_CONCURRENCY,
  type TempPageTaskScheduler,
} from "~/entrypoints/background/tempPageTaskScheduler"

interface Deferred<T> {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  let reject!: Deferred<T>["reject"]
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

describe("createTempPageTaskScheduler", () => {
  it("limits global concurrency to three and refills a slot as soon as any task finishes", async () => {
    const scheduler: TempPageTaskScheduler = createTempPageTaskScheduler()
    const controls = Array.from({ length: 4 }, () => createDeferred<void>())
    const started: number[] = []
    let active = 0
    let maxActive = 0

    expect(TEMP_PAGE_TASK_CONCURRENCY).toBe(3)

    const tasks = controls.map((control, index) =>
      scheduler.run(`https://site-${index + 1}.example.invalid`, async () => {
        started.push(index + 1)
        active += 1
        maxActive = Math.max(maxActive, active)
        await control.promise
        active -= 1
      }),
    )

    await vi.waitFor(() => {
      expect(started).toEqual([1, 2, 3])
    })
    expect(maxActive).toBe(3)

    controls[1].resolve()

    await vi.waitFor(() => {
      expect(started).toEqual([1, 2, 3, 4])
    })
    expect(maxActive).toBe(3)

    controls[0].resolve()
    controls[2].resolve()
    controls[3].resolve()
    await expect(Promise.all(tasks)).resolves.toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it("serializes same-origin tasks without consuming a global slot while they wait", async () => {
    const scheduler = createTempPageTaskScheduler(2)
    const firstControl = createDeferred<void>()
    const otherControl = createDeferred<void>()
    const firstTask = vi.fn(async () => firstControl.promise)
    const queuedSameOriginTask = vi.fn(async () => undefined)
    const otherOriginTask = vi.fn(async () => otherControl.promise)

    const first = scheduler.run("https://site-1.example.invalid", firstTask)
    const queuedSameOrigin = scheduler.run(
      "https://site-1.example.invalid",
      queuedSameOriginTask,
    )
    const otherOrigin = scheduler.run(
      "https://site-2.example.invalid",
      otherOriginTask,
    )

    await vi.waitFor(() => {
      expect(firstTask).toHaveBeenCalledOnce()
      expect(otherOriginTask).toHaveBeenCalledOnce()
    })
    expect(queuedSameOriginTask).not.toHaveBeenCalled()

    firstControl.resolve()
    await expect(first).resolves.toBeUndefined()
    await expect(queuedSameOrigin).resolves.toBeUndefined()

    otherControl.resolve()
    await expect(otherOrigin).resolves.toBeUndefined()
  })

  it("releases global and origin capacity after rejection so queued same-origin work can run", async () => {
    const scheduler = createTempPageTaskScheduler(1)
    const failureControl = createDeferred<void>()
    const succeedingTask = vi.fn(async () => "succeeded")

    const failing = scheduler.run(
      "https://site-1.example.invalid",
      async () => failureControl.promise,
    )
    const failureAssertion = expect(failing).rejects.toThrow("task failed")
    const succeeding = scheduler.run(
      "https://site-1.example.invalid",
      succeedingTask,
    )

    failureControl.reject(new Error("task failed"))

    await failureAssertion
    await expect(succeeding).resolves.toBe("succeeded")
    expect(succeedingTask).toHaveBeenCalledOnce()
  })
})
