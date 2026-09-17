import { describe, expect, it, vi } from "vitest"

import { createKeyedTaskQueue } from "~/services/core/keyedTaskQueue"
import { createDeferred } from "~~/tests/test-utils/deferred"

describe("createKeyedTaskQueue", () => {
  it("runs same-key tasks one at a time in arrival order", async () => {
    const queue = createKeyedTaskQueue()
    const firstControl = createDeferred<string>()
    const order: string[] = []
    let active = 0
    let maxActive = 0

    const first = queue.run("shared-session", async () => {
      order.push("first-start")
      active += 1
      maxActive = Math.max(maxActive, active)
      const value = await firstControl.promise
      active -= 1
      order.push("first-end")
      return value
    })
    const second = queue.run("shared-session", async () => {
      order.push("second")
      active += 1
      maxActive = Math.max(maxActive, active)
      active -= 1
      return "second"
    })

    await vi.waitFor(() => {
      expect(order).toEqual(["first-start"])
    })

    firstControl.resolve("first")

    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe("second")
    expect(order).toEqual(["first-start", "first-end", "second"])
    expect(maxActive).toBe(1)
  })

  it("runs different keys concurrently without holding a global slot while a key waits", async () => {
    const queue = createKeyedTaskQueue({ concurrency: 2 })
    const firstControl = createDeferred<void>()
    const otherControl = createDeferred<void>()
    const firstTask = vi.fn(async () => firstControl.promise)
    const queuedSameKeyTask = vi.fn(async () => undefined)
    const otherKeyTask = vi.fn(async () => otherControl.promise)

    const first = queue.run("shared-session", firstTask)
    const queuedSameKey = queue.run("shared-session", queuedSameKeyTask)
    const otherKey = queue.run("other-session", otherKeyTask)

    await vi.waitFor(() => {
      expect(firstTask).toHaveBeenCalledOnce()
      expect(otherKeyTask).toHaveBeenCalledOnce()
    })
    expect(queuedSameKeyTask).not.toHaveBeenCalled()

    firstControl.resolve()
    await expect(first).resolves.toBeUndefined()
    await expect(queuedSameKey).resolves.toBeUndefined()

    otherControl.resolve()
    await expect(otherKey).resolves.toBeUndefined()
  })

  it("limits global concurrency and refills a slot as soon as any task finishes", async () => {
    const queue = createKeyedTaskQueue({ concurrency: 2 })
    const controls = Array.from({ length: 4 }, () => createDeferred<void>())
    const started: number[] = []
    let active = 0
    let maxActive = 0

    const tasks = controls.map((control, index) =>
      queue.run(`session-${index + 1}`, async () => {
        started.push(index + 1)
        active += 1
        maxActive = Math.max(maxActive, active)
        await control.promise
        active -= 1
      }),
    )

    await vi.waitFor(() => {
      expect(started).toEqual([1, 2])
    })
    expect(maxActive).toBe(2)

    controls[1].resolve()

    await vi.waitFor(() => {
      expect(started).toEqual([1, 2, 3])
    })
    expect(maxActive).toBe(2)

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

  it("releases key and global capacity after rejection while preserving the rejection", async () => {
    const queue = createKeyedTaskQueue({ concurrency: 1 })
    const failureControl = createDeferred<void>()
    const succeedingTask = vi.fn(async () => "succeeded")

    const failing = queue.run("shared-session", async () => {
      await failureControl.promise
      return "unreachable"
    })
    const failureAssertion = expect(failing).rejects.toThrow("task failed")
    const succeeding = queue.run("shared-session", succeedingTask)

    failureControl.reject(new Error("task failed"))

    await failureAssertion
    await expect(succeeding).resolves.toBe("succeeded")
    expect(succeedingTask).toHaveBeenCalledOnce()
  })

  it("drops idle keys so a long-lived queue does not accumulate them", async () => {
    const queue = createKeyedTaskQueue()
    const heldControl = createDeferred<void>()

    expect(queue.activeKeyCount).toBe(0)

    const held = queue.run("held-session", async () => heldControl.promise)
    await expect(queue.run("quick-session", async () => "done")).resolves.toBe(
      "done",
    )

    expect(queue.activeKeyCount).toBe(1)

    heldControl.resolve()
    await expect(held).resolves.toBeUndefined()

    await expect(
      queue.run("failed-session", async () => {
        throw new Error("task failed")
      }),
    ).rejects.toThrow("task failed")
    expect(queue.activeKeyCount).toBe(0)
  })
})
