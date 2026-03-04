import { describe, expect, it } from "vitest"

import { runPerKeySequential } from "~/services/accounts/accountKeyAutoProvisioning/perOriginQueue"

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 *
 */
function createDeferred() {
  let resolve!: () => void
  let reject!: (reason?: any) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("accountKeyRepair rate limiting", () => {
  it("serializes same-origin work but does not globally serialize different origins", async () => {
    const started: string[] = []
    const activeByOrigin = new Map<string, number>()

    const deferred = {
      a1: createDeferred(),
      a2: createDeferred(),
      b1: createDeferred(),
    }

    const items = [
      { id: "a1", origin: "https://a.example.com" },
      { id: "a2", origin: "https://a.example.com" },
      { id: "b1", origin: "https://b.example.com" },
    ] as const

    const runPromise = runPerKeySequential({
      items: [...items],
      getKey: (item) => item.origin,
      worker: async (item) => {
        const active = (activeByOrigin.get(item.origin) ?? 0) + 1
        activeByOrigin.set(item.origin, active)
        if (active > 1) {
          throw new Error(`Overlap detected for origin ${item.origin}`)
        }

        started.push(item.id)
        await deferred[item.id].promise

        activeByOrigin.set(item.origin, active - 1)
      },
    })

    await flushPromises()

    expect(started).toEqual(expect.arrayContaining(["a1", "b1"]))
    expect(started).not.toContain("a2")

    deferred.a1.resolve()
    await flushPromises()
    expect(started).toContain("a2")

    deferred.a2.resolve()
    deferred.b1.resolve()

    await runPromise
  })
})
