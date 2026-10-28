import { afterEach, expect, it, vi } from "vitest"

import { withStoredValue } from "~~/scripts/cdp/sandbox.mjs"

afterEach(() => vi.unstubAllGlobals())
it("restores only task-owned preference fields and preserves concurrent edits", async () => {
  let raw = JSON.stringify({
    autoProvisionKeyOnAccountAdd: true,
    language: "en",
  })
  let locked = false
  const lock = vi.fn(async (_name, _options, work) => {
    locked = true
    try {
      return await work()
    } finally {
      locked = false
    }
  })
  vi.stubGlobal("navigator", { locks: { request: lock } })
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: (_key: string, callback: (value: unknown) => void) => {
          expect(locked).toBe(true)
          callback({ prefs: raw })
        },
        set: (value: { prefs: string }, callback: () => void) => {
          expect(locked).toBe(true)
          raw = value.prefs
          callback()
        },
      },
    },
  })
  const worker = {
    evaluate: async (fn: (arg: unknown) => unknown, arg?: unknown) => fn(arg),
  }
  await withStoredValue(
    worker,
    "prefs",
    { autoProvisionKeyOnAccountAdd: false },
    async () => {
      raw = JSON.stringify({
        autoProvisionKeyOnAccountAdd: false,
        language: "ja",
        theme: "dark",
      })
    },
    { restorePatchedKeysOnly: true },
  )
  expect(JSON.parse(raw)).toEqual({
    autoProvisionKeyOnAccountAdd: true,
    language: "ja",
    theme: "dark",
  })
  expect(lock).toHaveBeenCalledTimes(2)
  expect(lock.mock.calls[0]?.[0]).toBe("all-api-hub:user-preferences")
})
