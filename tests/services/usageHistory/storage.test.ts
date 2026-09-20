import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USAGE_HISTORY_STORAGE_KEYS } from "~/services/history/usageHistory/constants"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { USAGE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/usageHistory"

describe("usageHistoryStorage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    const storage = new Storage({ area: "local" })
    await storage.remove(USAGE_HISTORY_STORAGE_KEYS.STORE)
  })

  it("sanitizes malformed persisted account data into the current store shape", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
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
            state: "error",
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
    const account = store.accounts[" account-1 "]

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
        quotaConsumed: 8,
      },
    })
    expect(account.hourly).toEqual({
      "2026-03-27": {
        "09": {
          requests: 1,
          promptTokens: 2,
          completionTokens: 3,
          totalTokens: 5,
          quotaConsumed: 4,
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
          quotaConsumed: 5,
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
          quotaConsumed: 2,
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
            quotaConsumed: 3,
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
            quotaConsumed: 4,
          },
        },
      },
    })
    expect(account.latencyDaily["2026-03-27"]).toMatchObject({
      count: 2,
      sum: 4,
      max: 5,
      slowCount: 0,
      unknownCount: 3,
    })
    expect(account.latencyDaily["2026-03-27"].buckets.slice(0, 3)).toEqual([
      1, 2, 0,
    ])
    expect(account.latencyDailyByModel["gpt-4"]["2026-03-27"]).toMatchObject({
      count: 1,
      sum: 2,
      max: 3,
      slowCount: 4,
      unknownCount: 5,
    })
    expect(account.latencyDailyByToken["1"]["2026-03-27"]).toMatchObject({
      count: 1,
      sum: 1,
      max: 1,
    })
    expect(
      account.latencyDailyByTokenByModel["1"]["gpt-4"]["2026-03-27"],
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
              quotaConsumed: 1,
            },
            "2026-03-27": {
              requests: 2,
              promptTokens: 2,
              completionTokens: 2,
              totalTokens: 4,
              quotaConsumed: 2,
            },
          },
          hourly: {
            "2026-03-26": {
              "09": {
                requests: 1,
                promptTokens: 1,
                completionTokens: 1,
                totalTokens: 2,
                quotaConsumed: 1,
              },
            },
            "2026-03-27": {
              "10": {
                requests: 2,
                promptTokens: 2,
                completionTokens: 2,
                totalTokens: 4,
                quotaConsumed: 2,
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
                quotaConsumed: 1,
              },
            },
            keep: {
              "2026-03-27": {
                requests: 1,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                quotaConsumed: 1,
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
          quotaConsumed: 2,
        },
      })
      expect(accountAfterPrune.hourly).toEqual({
        "2026-03-27": {
          "10": {
            requests: 2,
            promptTokens: 2,
            completionTokens: 2,
            totalTokens: 4,
            quotaConsumed: 2,
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
            quotaConsumed: 1,
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

  it("returns empty stores for invalid payloads and read failures", async () => {
    const storage = new Storage({ area: "local" })

    await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, {
      schemaVersion: 999,
      accounts: {
        account: {},
      },
    })

    await expect(usageHistoryStorage.getStore()).resolves.toEqual({
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {},
    })

    vi.spyOn((usageHistoryStorage as any).storage, "get").mockRejectedValueOnce(
      new Error("read failed"),
    )

    await expect(usageHistoryStorage.getStore()).resolves.toEqual({
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {},
    })
  })

  it("does not update or overwrite usage history when the read fails", async () => {
    const updater = vi.fn()
    const set = vi.spyOn((usageHistoryStorage as any).storage, "set")
    vi.spyOn((usageHistoryStorage as any).storage, "get").mockRejectedValueOnce(
      new Error("read failed"),
    )

    await expect(usageHistoryStorage.updateStore(updater)).resolves.toEqual({
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {},
    })

    expect(updater).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it("returns false when persisting or pruning fails", async () => {
    vi.spyOn((usageHistoryStorage as any).storage, "set").mockRejectedValueOnce(
      new Error("write failed"),
    )

    await expect(
      usageHistoryStorage.setStore({
        schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
        accounts: {},
      }),
    ).resolves.toBe(false)

    vi.spyOn(usageHistoryStorage, "updateStore").mockRejectedValueOnce(
      new Error("prune failed"),
    )

    await expect(usageHistoryStorage.pruneAllAccounts(7, "UTC")).resolves.toBe(
      false,
    )
  })
})
