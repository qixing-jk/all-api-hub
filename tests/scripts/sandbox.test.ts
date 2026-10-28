import { afterEach, describe, expect, it, vi } from "vitest"

import {
  withTemporaryAccount,
  withUiCreatedAccount,
} from "~~/scripts/cdp/sandbox.mjs"

afterEach(() => vi.unstubAllGlobals())

describe("temporary account isolation", () => {
  it.each(["seed", "ui", "ui-renamed", "ui-delayed-error"])(
    "preserves accounts and concurrent edits after failure (%s)",
    async (mode) => {
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
            get: (_key: string, callback?: (value: unknown) => void) => {
              if (callback) callback({ site_accounts: raw })
              else return Promise.resolve({ site_accounts: raw })
            },
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
        (mode === "seed"
          ? withTemporaryAccount
          : (
              worker: Parameters<typeof withTemporaryAccount>[0],
              _fixture: unknown,
              run: (account: Record<string, unknown>) => Promise<void>,
            ) =>
              withUiCreatedAccount(
                worker,
                async (name: string) => {
                  if (mode === "ui-delayed-error") {
                    setTimeout(() => {
                      const envelope = JSON.parse(raw)
                      envelope.accounts.push({
                        id: "ui-created",
                        site_name: name,
                      })
                      raw = JSON.stringify(envelope)
                    }, 50)
                    throw new Error("test failed")
                  }
                  const envelope = JSON.parse(raw)
                  envelope.accounts.push({ id: "ui-created", site_name: name })
                  raw = JSON.stringify(envelope)
                },
                run,
              ))(
          worker,
          { id: "fixture", site_url: "https://platform.kimi.ai" },
          async () => {
            const envelope = JSON.parse(raw)
            if (mode === "ui-renamed")
              envelope.accounts.find(
                (account: { id: string }) => account.id === "ui-created",
              ).site_name = "renamed"
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
      expect(JSON.parse(raw)).toMatchObject(
        mode === "ui-delayed-error"
          ? {
              accounts: [{ id: "real", notes: "before" }],
              pinnedAccountIds: ["real"],
            }
          : {
              accounts: [
                {
                  id: "real",
                  site_url: "https://platform.kimi.ai",
                  notes: "edited",
                },
                { id: "added" },
              ],
              pinnedAccountIds: ["real", "added"],
            },
      )
    },
  )

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
