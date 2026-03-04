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
  })

  it("sanitizes invalid stored payloads", async () => {
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, { foo: "bar" })

    const store = await dailyBalanceHistoryStorage.getStore()
    expect(store.schemaVersion).toBe(DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION)
    expect(store.snapshotsByAccountId).toEqual({})
  })

  it("prunes snapshots older than the retention window on upsert", async () => {
    vi.useFakeTimers()
    const fixedNow = new Date(Date.UTC(2026, 1, 7, 12, 0, 0))
    vi.setSystemTime(fixedNow)

    try {
      storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        snapshotsByAccountId: {
          a1: {
            "2026-02-05": {
              quota: 1,
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
        retentionDays: 2,
        timeZone: "UTC",
      })

      expect(ok).toBe(true)

      const store = await dailyBalanceHistoryStorage.getStore()
      expect(store.snapshotsByAccountId.a1?.["2026-02-05"]).toBeUndefined()
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
  })
})
