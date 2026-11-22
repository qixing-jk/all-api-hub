import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USAGE_HISTORY_STORAGE_KEYS } from "~/services/history/usageHistory/constants"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import {
  USAGE_HISTORY_STORE_SCHEMA_VERSION,
  USAGE_HISTORY_SYNC_STATES,
} from "~/types/usageHistory"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("usageHistoryStorage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    const storage = new Storage({ area: "local" })
    await storage.remove(USAGE_HISTORY_STORAGE_KEYS.STORE)
  })

  it("preserves recorded zero reference cost across migration and reload", async () => {
    const storage = new Storage({ area: "local" })
    await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, {
      schemaVersion: 1,
      accounts: {
        account: {
          daily: {
            "2026-03-27": { requests: 1, quotaConsumed: 0 },
            "2026-03-28": { requests: 1 },
            "2026-03-29": { requests: 1, quotaConsumed: null },
          },
          dailyByModel: {
            test: { "2026-03-27": { requests: 1, quotaConsumed: 0 } },
          },
        },
      },
    })

    for (const store of [
      await usageHistoryStorage.getStore(),
      await usageHistoryStorage.getStore(),
    ]) {
      const account = atIndex(store.accounts, "account")
      expect(account.daily["2026-03-27"]?.referenceCostUsd).toBe(0)
      expect(account.daily["2026-03-28"]?.referenceCostUsd).toBeUndefined()
      expect(account.daily["2026-03-29"]?.referenceCostUsd).toBeUndefined()
      expect(account.dailyByModel.test?.["2026-03-27"]?.referenceCostUsd).toBe(
        0,
      )
    }
  })

  it("sanitizes malformed persisted account data into the current store shape", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, {
      schemaVersion: 2,
      accounts: {
        "": {
          daily: {
            "2026-03-27": { requests: 99 },
          },
        },
        " account-1 ": {
          cursor: {
            lastSeenCreatedAt: "not-a-number",
            fingerprintsAtLastSeenCreatedAt: ["fp-1", "", "  ", 42],
          },
          status: {
            state: USAGE_HISTORY_SYNC_STATES.Error,
            lastSyncAt: 100,
            lastSuccessAt: "bad",
            lastWarning: 1,
            lastError: "failed once",
            unsupportedUntil: 300,
          },
          daily: {
            "2026-03-27": {
              requests: 3,
              promptTokens: "4",
              completionTokens: -2,
              totalTokens: 7,
              quotaConsumed: "8",
            },
            invalid: { requests: 100 },
          },
          hourly: {
            "2026-03-27": {
              "09": {
                requests: 1,
                promptTokens: 2,
                completionTokens: 3,
                totalTokens: 5,
                quotaConsumed: 4,
              },
              "99": { requests: 100 },
            },
            invalid: {
              "09": { requests: 200 },
            },
          },
          dailyByModel: {
            "gpt-4": {
              "2026-03-27": {
                requests: 2,
                promptTokens: 3,
                completionTokens: 4,
                totalTokens: 7,
                quotaConsumed: 5,
              },
            },
            "": {
              "2026-03-27": { requests: 1 },
            },
          },
          tokenNamesById: {
            "1": " Token One ",
            "2": "   ",
            "3": 123,
          },
          dailyByToken: {
            "1": {
              "2026-03-27": {
                requests: 6,
                promptTokens: 0,
                completionTokens: 1,
                totalTokens: 1,
                quotaConsumed: 2,
              },
            },
            "": {
              "2026-03-27": { requests: 10 },
            },
          },
          hourlyByToken: {
            "1": {
              "2026-03-27": {
                "09": {
                  requests: 4,
                  promptTokens: 1,
                  completionTokens: 1,
                  totalTokens: 2,
                  quotaConsumed: 3,
                },
                "88": { requests: 10 },
              },
            },
            broken: null,
          },
          dailyByTokenByModel: {
            "1": {
              "gpt-4": {
                "2026-03-27": {
                  requests: 3,
                  promptTokens: 2,
                  completionTokens: 1,
                  totalTokens: 3,
                  quotaConsumed: 4,
                },
                invalid: { requests: 99 },
              },
              "": {
                "2026-03-27": { requests: 99 },
              },
            },
            broken: null,
          },
          latencyDaily: {
            "2026-03-27": {
              count: "2",
              sum: 4,
              max: 5,
              slowCount: -1,
              unknownCount: "3",
              buckets: [1, "2", -3],
            },
            invalid: {
              count: 10,
            },
          },
          latencyDailyByModel: {
            "gpt-4": {
              "2026-03-27": {
                count: 1,
                sum: 2,
                max: 3,
                slowCount: 4,
                unknownCount: 5,
                buckets: [6],
              },
            },
            "": {
              "2026-03-27": { count: 1 },
            },
          },
          latencyDailyByToken: {
            "1": {
              "2026-03-27": {
                count: 1,
                sum: 1,
                max: 1,
                slowCount: 0,
                unknownCount: 0,
                buckets: [1, 0, 0],
              },
            },
            "": {
              "2026-03-27": { count: 1 },
            },
          },
          latencyDailyByTokenByModel: {
            "1": {
              "gpt-4": {
                "2026-03-27": {
                  count: 2,
                  sum: 3,
                  max: 4,
                  slowCount: 5,
                  unknownCount: 6,
                  buckets: [7, 8],
                },
              },
              "": {
                "2026-03-27": { count: 9 },
              },
            },
            broken: null,
          },
        },
      },
    })

    const store = await usageHistoryStorage.getStore()
    const account = atIndex(store.accounts, " account-1 ")

    expect(store.schemaVersion).toBe(USAGE_HISTORY_STORE_SCHEMA_VERSION)
    expect(Object.keys(store.accounts)).toEqual([" account-1 "])
    expect(account.cursor).toEqual({
      lastSeenCreatedAt: 0,
      fingerprintsAtLastSeenCreatedAt: ["fp-1"],
    })
    expect(account.status).toEqual({
      state: "error",
      lastSyncAt: 100,
      lastSuccessAt: undefined,
      lastWarning: undefined,
      lastError: "failed once",
      unsupportedUntil: 300,
    })
    expect(account.daily).toEqual({
      "2026-03-27": {
        requests: 3,
        promptTokens: 4,
        completionTokens: 0,
        totalTokens: 7,
        referenceCostUsd: 0.000016,
      },
    })
    expect(account.hourly).toEqual({
      "2026-03-27": {
        "09": {
          requests: 1,
          promptTokens: 2,
          completionTokens: 3,
          totalTokens: 5,
          referenceCostUsd: 0.000008,
        },
      },
    })
    expect(account.dailyByModel).toEqual({
      "gpt-4": {
        "2026-03-27": {
          requests: 2,
          promptTokens: 3,
          completionTokens: 4,
          totalTokens: 7,
          referenceCostUsd: 0.00001,
        },
      },
    })
    expect(account.tokenNamesById).toEqual({
      "1": "Token One",
    })
    expect(account.dailyByToken).toEqual({
      "1": {
        "2026-03-27": {
          requests: 6,
          promptTokens: 0,
          completionTokens: 1,
          totalTokens: 1,
          referenceCostUsd: 0.000004,
        },
      },
    })
    expect(account.hourlyByToken).toEqual({
      "1": {
        "2026-03-27": {
          "09": {
            requests: 4,
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            referenceCostUsd: 0.000006,
          },
        },
      },
    })
    expect(account.dailyByTokenByModel).toEqual({
      "1": {
        "gpt-4": {
          "2026-03-27": {
            requests: 3,
            promptTokens: 2,
            completionTokens: 1,
            totalTokens: 3,
            referenceCostUsd: 0.000008,
          },
        },
      },
    })
    expect(atIndex(account.latencyDaily, "2026-03-27")).toMatchObject({
      count: 2,
      sum: 4,
      max: 5,
      slowCount: 0,
      unknownCount: 3,
    })
    expect(
      atIndex(account.latencyDaily, "2026-03-27").buckets.slice(0, 3),
    ).toEqual([1, 2, 0])
    expect(
      atIndex(account.latencyDailyByModel, "gpt-4")["2026-03-27"],
    ).toMatchObject({
      count: 1,
      sum: 2,
      max: 3,
      slowCount: 4,
      unknownCount: 5,
    })
    expect(
      atIndex(account.latencyDailyByToken, "1")["2026-03-27"],
    ).toMatchObject({
      count: 1,
      sum: 1,
      max: 1,
    })
    expect(
      atIndex(atIndex(account.latencyDailyByTokenByModel, "1"), "gpt-4")[
        "2026-03-27"
      ],
    ).toMatchObject({
      count: 2,
      sum: 3,
      max: 4,
      slowCount: 5,
      unknownCount: 6,
    })
  })

  it.each([
    { retentionDays: 2, now: "2026-03-28T00:00:00Z" },
    { retentionDays: 730, now: "2028-03-25T00:00:00Z" },
  ])(
    "updates account stores and prunes data outside a $retentionDays-day window",
    async ({ retentionDays, now }) => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse(now))

      const updated = await usageHistoryStorage.updateAccountStore(
        "account-2",
        (accountStore) => ({
          ...accountStore,
          daily: {
            "2026-03-26": {
              requests: 1,
              promptTokens: 1,
              completionTokens: 1,
              totalTokens: 2,
              referenceCostUsd: 0.000002,
            },
            "2026-03-27": {
              requests: 2,
              promptTokens: 2,
              completionTokens: 2,
              totalTokens: 4,
              referenceCostUsd: 0.000004,
            },
          },
          hourly: {
            "2026-03-26": {
              "09": {
                requests: 1,
                promptTokens: 1,
                completionTokens: 1,
                totalTokens: 2,
                referenceCostUsd: 0.000002,
              },
            },
            "2026-03-27": {
              "10": {
                requests: 2,
                promptTokens: 2,
                completionTokens: 2,
                totalTokens: 4,
                referenceCostUsd: 0.000004,
              },
            },
          },
          tokenNamesById: {
            old: "Old token",
            keep: "Keep token",
          },
          dailyByToken: {
            old: {
              "2026-03-26": {
                requests: 1,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                referenceCostUsd: 0.000002,
              },
            },
            keep: {
              "2026-03-27": {
                requests: 1,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                referenceCostUsd: 0.000002,
              },
            },
          },
          latencyDaily: {
            "2026-03-26": {
              count: 1,
              sum: 1,
              max: 1,
              slowCount: 0,
              unknownCount: 0,
              buckets: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
            "2026-03-27": {
              count: 2,
              sum: 2,
              max: 2,
              slowCount: 0,
              unknownCount: 0,
              buckets: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
          },
          latencyDailyByToken: {
            old: {
              "2026-03-26": {
                count: 1,
                sum: 1,
                max: 1,
                slowCount: 0,
                unknownCount: 0,
                buckets: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              },
            },
            keep: {
              "2026-03-27": {
                count: 1,
                sum: 1,
                max: 1,
                slowCount: 0,
                unknownCount: 0,
                buckets: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              },
            },
          },
        }),
      )

      expect(updated.daily["2026-03-27"]?.requests).toBe(2)
      expect(
        await usageHistoryStorage.getAccountStore("missing-account"),
      ).toMatchObject({
        daily: {},
        status: { state: "never" },
      })

      await expect(
        usageHistoryStorage.pruneAllAccounts(retentionDays, "UTC"),
      ).resolves.toBe(true)

      const accountAfterPrune =
        await usageHistoryStorage.getAccountStore("account-2")
      expect(accountAfterPrune.daily).toEqual({
        "2026-03-27": {
          requests: 2,
          promptTokens: 2,
          completionTokens: 2,
          totalTokens: 4,
          referenceCostUsd: 0.000004,
        },
      })
      expect(accountAfterPrune.hourly).toEqual({
        "2026-03-27": {
          "10": {
            requests: 2,
            promptTokens: 2,
            completionTokens: 2,
            totalTokens: 4,
            referenceCostUsd: 0.000004,
          },
        },
      })
      expect(accountAfterPrune.dailyByToken).toEqual({
        keep: {
          "2026-03-27": {
            requests: 1,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            referenceCostUsd: 0.000002,
          },
        },
      })
      expect(accountAfterPrune.latencyDaily).toEqual({
        "2026-03-27": {
          count: 2,
          sum: 2,
          max: 2,
          slowCount: 0,
          unknownCount: 0,
          buckets: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      })
      expect(accountAfterPrune.latencyDailyByToken).toEqual({
        keep: {
          "2026-03-27": {
            count: 1,
            sum: 1,
            max: 1,
            slowCount: 0,
            unknownCount: 0,
            buckets: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
        },
      })
      expect(accountAfterPrune.tokenNamesById).toEqual({
        keep: "Keep token",
      })
    },
  )

  it("reports unsupported schemas and read failures instead of presenting empty history", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, {
      schemaVersion: 999,
      accounts: {
        account: {},
      },
    })

    await expect(usageHistoryStorage.getStore()).rejects.toThrow(
      "Unsupported usage history schema",
    )

    vi.spyOn((usageHistoryStorage as any).storage, "get").mockRejectedValueOnce(
      new Error("read failed"),
    )

    await expect(usageHistoryStorage.getStore()).rejects.toThrow("read failed")
  })

  it("does not update or overwrite usage history when the read fails", async () => {
    const updater = vi.fn()
    const set = vi.spyOn((usageHistoryStorage as any).storage, "set")
    vi.spyOn((usageHistoryStorage as any).storage, "get").mockRejectedValueOnce(
      new Error("read failed"),
    )

    await expect(usageHistoryStorage.updateStore(updater)).rejects.toThrow(
      "read failed",
    )

    expect(updater).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it("rejects failed writes and returns false when pruning fails", async () => {
    vi.spyOn((usageHistoryStorage as any).storage, "set").mockRejectedValueOnce(
      new Error("write failed"),
    )

    await expect(
      usageHistoryStorage.updateStore((store) => store),
    ).rejects.toThrow("write failed")

    vi.spyOn(usageHistoryStorage, "updateStore").mockRejectedValueOnce(
      new Error("prune failed"),
    )

    await expect(usageHistoryStorage.pruneAllAccounts(7, "UTC")).resolves.toBe(
      false,
    )
  })
})

it("rejects unknown usage-history schema without overwriting it", async () => {
  const storage = new Storage({ area: "local" })
  const payload = {
    schemaVersion: 99,
    accounts: { future: { opaque: "keep" } },
  }
  await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, payload)
  await expect(usageHistoryStorage.getStore()).rejects.toThrow(
    "Unsupported usage history schema",
  )
  await expect(usageHistoryStorage.updateStore(() => {})).rejects.toThrow(
    "Unsupported usage history schema",
  )
  expect(await storage.get(USAGE_HISTORY_STORAGE_KEYS.STORE)).toEqual(payload)
})

describe("usage history financial persistence boundaries", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each([null, 0, false, "unrecognized", []])(
    "rejects existing malformed root %j without overwriting it",
    async (payload) => {
      const storage = new Storage({ area: "local" })
      await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, payload)
      await expect(usageHistoryStorage.getStore()).rejects.toThrow()
      const update = vi.fn()
      await expect(usageHistoryStorage.updateStore(update)).rejects.toThrow()
      expect(update).not.toHaveBeenCalled()
      expect(await storage.get(USAGE_HISTORY_STORAGE_KEYS.STORE)).toEqual(
        payload,
      )
    },
  )

  it.each([null, {}, [{ amount: 0 }]])(
    "rejects malformed canonical consumption %j instead of dropping it",
    async (consumption) => {
      const storage = new Storage({ area: "local" })
      const payload = {
        schemaVersion: 2,
        accounts: {
          a: { daily: { "2026-01-01": { requests: 1, consumption } } },
        },
      }
      await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, payload)
      await expect(usageHistoryStorage.getStore()).rejects.toThrow()
      await expect(usageHistoryStorage.updateStore(() => {})).rejects.toThrow()
      expect(await storage.get(USAGE_HISTORY_STORAGE_KEYS.STORE)).toEqual(
        payload,
      )
    },
  )

  it("surfaces corrupted financial coverage and leaves the saved bytes intact", async () => {
    const storage = new Storage({ area: "local" })
    const saved = {
      schemaVersion: 3,
      accounts: {
        a: {
          daily: {
            "2026-01-01": { requests: 1, consumptionIncomplete: "partial" },
          },
        },
      },
    }
    await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, saved)
    const mutate = vi.fn()
    await expect(usageHistoryStorage.getStore()).rejects.toThrow(
      "Invalid usage history consumption coverage",
    )
    await expect(usageHistoryStorage.updateStore(mutate)).rejects.toThrow(
      "Invalid usage history consumption coverage",
    )
    expect(mutate).not.toHaveBeenCalled()
    expect(await storage.get(USAGE_HISTORY_STORAGE_KEYS.STORE)).toEqual(saved)
  })

  it.each([null, [], 42])(
    "does not replace a malformed accounts container %j with empty data",
    async (accounts) => {
      const storage = new Storage({ area: "local" })
      const payload = { schemaVersion: 2, accounts }
      await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, payload)
      await expect(usageHistoryStorage.getStore()).rejects.toThrow()
      await expect(usageHistoryStorage.updateStore(() => {})).rejects.toThrow()
      expect(await storage.get(USAGE_HISTORY_STORAGE_KEYS.STORE)).toEqual(
        payload,
      )
    },
  )
})
