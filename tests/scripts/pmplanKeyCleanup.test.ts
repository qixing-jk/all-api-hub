import { afterEach, expect, it, vi } from "vitest"

// @ts-expect-error Node-only live helper does not have declarations.
import { revokePmplanKeys } from "~~/scripts/suites/pmplan/keyCleanup.mjs"

afterEach(() => vi.unstubAllGlobals())

it("continues cleaning other confirmed IDs when the first cleanup fails", async () => {
  const records = [
    { id: 17, status: "active" },
    { id: 18, status: "active" },
  ]
  const deletes: number[] = []
  const site = {
    evaluate: async (_fn: unknown, { id }: { id: number }) => {
      deletes.push(id)
      if (id === 17) throw new Error("DELETE failed")
      records[1]!.status = "revoked"
    },
  }
  await expect(
    revokePmplanKeys({ site, ids: [17, 18], readKeys: async () => records }),
  ).rejects.toThrow()
  expect(deletes).toEqual([17, 18])
  expect(records[1]!.status).toBe("revoked")
})

it("bounds a hung DELETE and accepts independently confirmed revocation without replay", async () => {
  let reads = 0
  const fetch = vi.fn(
    (_url, { signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        })
      }),
  )
  vi.stubGlobal("fetch", fetch)
  const site = {
    evaluate: (fn: (args: unknown) => unknown, args: unknown) => fn(args),
  }
  await expect(
    revokePmplanKeys({
      site,
      ids: [17],
      timeoutMs: 20,
      readKeys: async () => [
        { id: 17, status: reads++ ? "revoked" : "active" },
      ],
    }),
  ).resolves.toBeUndefined()
  expect(reads).toBe(2)
  expect(fetch).toHaveBeenCalledTimes(1)
})
