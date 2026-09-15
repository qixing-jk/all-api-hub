import { beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { getDayKeyFromUnixSeconds } from "~/services/history/dailyBalanceHistory/dayKeys"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/dailyBalanceHistory"

const storageData = new Map<string, any>()

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async set(key: string, value: any) {
      storageData.set(key, value)
    }

    async get(key: string) {
      return storageData.get(key)
    }

    async remove(key: string) {
      storageData.delete(key)
    }
  }

  return { Storage }
})

describe("dailyBalanceHistoryStorage", () => {
  beforeEach(() => {
    storageData.clear()
    vi.restoreAllMocks()
  })

  it("sanitizes invalid stored payloads", async () => {
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, { foo: "bar" })

    const store = await dailyBalanceHistoryStorage.getStore()
    expect(store.schemaVersion).toBe(DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION)
    expect(store.snapshotsByAccountId).toEqual({})
  })

  it.each([
    { retentionDays: 2, expiredDay: "2026-02-05", cutoffDay: "2026-02-06" },
    { retentionDays: 7300, expiredDay: "2006-02-12", cutoffDay: "2006-02-13" },
  ])(
    "prunes snapshots outside a $retentionDays-day window on upsert",
    async ({ retentionDays, expiredDay, cutoffDay }) => {
      vi.useFakeTimers()
      const fixedNow = new Date(Date.UTC(2026, 1, 7, 12, 0, 0))
      vi.setSystemTime(fixedNow)

      try {
        storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
          schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
          snapshotsByAccountId: {
            a1: {
              [expiredDay]: {
                quota: 1,
                today_income: 0,
                today_quota_consumption: 0,
                capturedAt: fixedNow.getTime(),
                source: "refresh",
              },
              [cutoffDay]: {
                quota: 2,
                today_income: 0,
                today_quota_consumption: 0,
                capturedAt: fixedNow.getTime(),
                source: "refresh",
              },
            },
          },
        })

        const nowUnixSeconds = Math.floor(Date.now() / 1000)
        const todayKey = getDayKeyFromUnixSeconds(nowUnixSeconds, "UTC")

        const ok = await dailyBalanceHistoryStorage.upsertSnapshot({
          accountId: "a1",
          dayKey: todayKey,
          snapshot: {
            quota: 10,
            today_income: 1,
            today_quota_consumption: 2,
            capturedAt: fixedNow.getTime(),
            source: "refresh",
          },
          retentionDays,
          timeZone: "UTC",
        })

        expect(ok).toBe(true)

        const store = await dailyBalanceHistoryStorage.getStore()
        expect(store.snapshotsByAccountId.a1?.[expiredDay]).toBeUndefined()
        expect(store.snapshotsByAccountId.a1?.[cutoffDay]?.quota).toBe(2)
        expect(store.snapshotsByAccountId.a1?.[todayKey]).toEqual(
          expect.objectContaining({
            quota: 10,
            today_income: 1,
            today_quota_consumption: 2,
            source: "refresh",
          }),
        )
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it("drops malformed account buckets and snapshot rows while preserving null optional fields", async () => {
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
      schemaVersion: 999,
      snapshotsByAccountId: {
        "": {
          "2026-02-07": {
            quota: 1,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "refresh",
          },
        },
        badBucket: "invalid",
        accountInvalidSnapshots: {
          "bad-day-key": {
            quota: 1,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "refresh",
          },
          "2026-02-07": null,
          "2026-02-08": {
            quota: "bad",
            capturedAt: 1,
            source: "refresh",
          },
          "2026-02-09": {
            quota: 1,
            capturedAt: "bad",
            source: "refresh",
          },
          "2026-02-10": {
            quota: 1,
            capturedAt: 1,
            source: "manual",
          },
        },
        accountValid: {
          "2026-02-11": {
            quota: 8,
            today_income: null,
            today_quota_consumption: null,
            capturedAt: 123,
            source: "alarm",
          },
        },
      },
    })

    const store = await dailyBalanceHistoryStorage.getStore()

    expect(store).toEqual({
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId: {
        accountValid: {
          "2026-02-11": {
            quota: 8,
            today_income: null,
            today_quota_consumption: null,
            capturedAt: 123,
            source: "alarm",
          },
        },
      },
    })
  })

  it("prunes all accounts that become empty and returns false for invalid day keys", async () => {
    vi.useFakeTimers()
    const fixedNow = new Date(Date.UTC(2026, 1, 7, 12, 0, 0))
    vi.setSystemTime(fixedNow)

    try {
      storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        snapshotsByAccountId: {
          pruneMe: {
            "2026-02-04": {
              quota: 1,
              today_income: 0,
              today_quota_consumption: 0,
              capturedAt: fixedNow.getTime(),
              source: "refresh",
            },
          },
          keepMe: {
            "2026-02-07": {
              quota: 2,
              today_income: 1,
              today_quota_consumption: 1,
              capturedAt: fixedNow.getTime(),
              source: "alarm",
            },
          },
        },
      })

      await expect(
        dailyBalanceHistoryStorage.pruneAll({
          retentionDays: 1,
          timeZone: "UTC",
        }),
      ).resolves.toBe(true)

      const prunedStore = await dailyBalanceHistoryStorage.getStore()
      expect(prunedStore.snapshotsByAccountId.pruneMe).toBeUndefined()
      expect(prunedStore.snapshotsByAccountId.keepMe?.["2026-02-07"]).toEqual(
        expect.objectContaining({
          quota: 2,
          source: "alarm",
        }),
      )

      await expect(
        dailyBalanceHistoryStorage.upsertSnapshot({
          accountId: "keepMe",
          dayKey: "not-a-day-key",
          snapshot: {
            quota: 10,
            today_income: 2,
            today_quota_consumption: 3,
            capturedAt: fixedNow.getTime(),
            source: "refresh",
          },
          retentionDays: 1,
          timeZone: "UTC",
        }),
      ).resolves.toBe(false)

      expect(
        (await dailyBalanceHistoryStorage.getStore()).snapshotsByAccountId
          .keepMe,
      ).not.toHaveProperty("not-a-day-key")
    } finally {
      vi.useRealTimers()
    }
  })
})
