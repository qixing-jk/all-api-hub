import { afterEach, describe, expect, it, vi } from "vitest"

import { withTemporaryAccount } from "~~/scripts/cdp/sandbox.mjs"

afterEach(() => vi.unstubAllGlobals())

describe("temporary account isolation", () => {
  it("preserves same-site accounts and concurrent edits when the test fails", async () => {
    let raw = JSON.stringify({
      accounts: [
        { id: "real", site_url: "https://platform.kimi.ai", notes: "before" },
      ],
      pinnedAccountIds: ["real"],
    })
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          work: () => Promise<unknown>,
        ) => work(),
      },
    })
    vi.stubGlobal("chrome", {
      runtime: {},
      storage: {
        local: {
          get: (_key: string, callback: (value: unknown) => void) =>
            callback({ site_accounts: raw }),
          set: (value: { site_accounts: string }, callback: () => void) => {
            raw = value.site_accounts
            callback()
          },
          remove: (_key: string, callback: () => void) => {
            raw = ""
            callback()
          },
        },
      },
    })
    const worker = {
      evaluate: async (fn: (value: unknown) => unknown, value?: unknown) =>
        fn(value),
    }
    await expect(
      withTemporaryAccount(
        worker,
        { id: "fixture", site_url: "https://platform.kimi.ai" },
        async () => {
          const envelope = JSON.parse(raw)
          expect(envelope.accounts).toHaveLength(2)
          envelope.accounts.find(
            (account: { id: string }) => account.id === "real",
          ).notes = "edited"
          envelope.accounts.push({ id: "added" })
          envelope.pinnedAccountIds.push("added")
          raw = JSON.stringify(envelope)
          throw new Error("test failed")
        },
      ),
    ).rejects.toThrow("test failed")
    expect(JSON.parse(raw)).toMatchObject({
      accounts: [
        { id: "real", site_url: "https://platform.kimi.ai", notes: "edited" },
        { id: "added" },
      ],
      pinnedAccountIds: ["real", "added"],
    })
  })

  it("does not overwrite malformed account storage", async () => {
    const set = vi.fn()
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          work: () => Promise<unknown>,
        ) => work(),
      },
    })
    vi.stubGlobal("chrome", {
      runtime: {},
      storage: {
        local: {
          get: (_key: string, callback: (value: unknown) => void) =>
            callback({ site_accounts: "broken JSON" }),
          set,
        },
      },
    })
    const worker = {
      evaluate: async (fn: (value: unknown) => unknown, value?: unknown) =>
        fn(value),
    }
    await expect(
      withTemporaryAccount(worker, { id: "fixture" }, vi.fn()),
    ).rejects.toThrow()
    expect(set).not.toHaveBeenCalled()
  })
})
