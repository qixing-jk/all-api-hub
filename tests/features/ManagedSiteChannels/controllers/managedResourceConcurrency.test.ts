import { describe, expect, it, vi } from "vitest"

import { mapSettledWithConcurrency } from "~/features/ManagedSiteChannels/controllers/managedResourceConcurrency"
import { mapSettledWithConcurrency as mapNativeSettledWithConcurrency } from "~/services/apiAdapters/nativeResources/concurrency"

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe("mapSettledWithConcurrency", () => {
  it("keeps the managed-site import as a compatibility re-export", () => {
    expect(mapSettledWithConcurrency).toBe(mapNativeSettledWithConcurrency)
  })

  it("caps concurrency and preserves input order when work settles out of order", async () => {
    const deferredByItem = new Map<
      number,
      ReturnType<typeof createDeferred<string>>
    >()
    const started: number[] = []
    let active = 0
    let maxActive = 0

    const resultPromise = mapSettledWithConcurrency(
      [0, 1, 2, 3, 4, 5],
      4,
      async (item) => {
        started.push(item)
        active += 1
        maxActive = Math.max(maxActive, active)
        const deferred = createDeferred<string>()
        deferredByItem.set(item, deferred)
        try {
          return await deferred.promise
        } finally {
          active -= 1
        }
      },
    )

    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]))
    deferredByItem.get(3)?.resolve("value-3")
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4]))
    deferredByItem.get(1)?.reject(new Error("failed-1"))
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4, 5]))

    deferredByItem.get(5)?.resolve("value-5")
    deferredByItem.get(0)?.resolve("value-0")
    deferredByItem.get(4)?.resolve("value-4")
    deferredByItem.get(2)?.resolve("value-2")

    const results = await resultPromise

    expect(maxActive).toBe(4)
    expect(results).toHaveLength(6)
    expect(results[0]).toEqual({ status: "fulfilled", value: "value-0" })
    expect(results[1]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "failed-1" }),
    })
    expect(results.slice(2)).toEqual([
      { status: "fulfilled", value: "value-2" },
      { status: "fulfilled", value: "value-3" },
      { status: "fulfilled", value: "value-4" },
      { status: "fulfilled", value: "value-5" },
    ])
  })
})
