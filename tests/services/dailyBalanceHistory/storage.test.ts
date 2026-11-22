import { beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { BALANCE_HISTORY_TREND_CHART_TYPES } from "~/features/BalanceHistory/contracts"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import {
  DAILY_BALANCE_HISTORY_CAPTURE_SOURCES,
  DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
} from "~/types/dailyBalanceHistory"
import type { FinancialHistorySnapshot } from "~/types/dailyBalanceHistory"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

const storageData = new Map<string, any>()
let failWrites = false

function createNativeSnapshot(
  accountId: string,
  capturedAt: number,
): FinancialHistorySnapshot {
  const scope = {
    subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId } as const,
    authority: "https://fixture.invalid",
    models: { kind: SCOPE_SELECTION_KINDS.All } as const,
    projects: { kind: SCOPE_SELECTION_KINDS.All } as const,
    keys: { kind: SCOPE_SELECTION_KINDS.All } as const,
    groups: { kind: SCOPE_SELECTION_KINDS.All } as const,
  }
  return {
    source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
    balance: {
      schemaVersion: 2,
      subject: scope.subject,
      capturedAt,
      coverage: FINANCIAL_COVERAGE.Complete,
      positions: [
        balancePosition({
          id: "wallet",
          scope,
          value: "10",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
          observedAt: capturedAt,
          source: {
            adapter: "fixture",
            operation: "wallet",
            contractVersion: "2",
            kind: EVIDENCE_KINDS.Reported,
          },
        }),
      ],
    },
  }
}

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async set(key: string, value: any) {
      if (failWrites) throw new Error("test storage write failure")
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

  it("rejects unversioned stored payloads", async () => {
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
      foo: BALANCE_HISTORY_TREND_CHART_TYPES.Bar,
    })

    await expect(dailyBalanceHistoryStorage.getStore()).rejects.toThrow(
      "unsupported_balance_history_version",
    )
  })

  it("keeps the original ledger on migration write failure and can retry it", async () => {
    const legacy = { schemaVersion: 3, snapshotsByAccountId: {} }
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, legacy)
    failWrites = true
    try {
      await expect(dailyBalanceHistoryStorage.getStore()).rejects.toThrow(
        "balance_history_write_failed",
      )
      expect(storageData.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toEqual(
        legacy,
      )
    } finally {
      failWrites = false
    }
    await expect(dailyBalanceHistoryStorage.getStore()).resolves.toMatchObject({
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
    })
  })

  it("refuses to replace malformed archived entries with an empty ledger", async () => {
    const legacy = { schemaVersion: 3, snapshotsByAccountId: [] }
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, legacy)
    await expect(dailyBalanceHistoryStorage.getStore()).rejects.toThrow(
      "invalid_balance_history_store",
    )
    expect(storageData.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toEqual(
      legacy,
    )
  })

  it("compacts repeated intraday refreshes while retaining day boundaries and removal events", async () => {
    const start = Date.UTC(2026, 1, 7)
    vi.setSystemTime(start + 86_399_000)
    try {
      const entries = Array.from({ length: 96 }, (_, index) => ({
        ...createNativeSnapshot("a1", start + index * 900_000),
        generation: index,
      }))
      entries[48]!.balance!.positions = []
      storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: { a1: entries },
      })
      await dailyBalanceHistoryStorage.appendFinancialSnapshot({
        accountId: "a1",
        snapshot: { ...createNativeSnapshot("a1", Date.now()), generation: 96 },
        retentionDays: 30,
        timeZone: "UTC",
      })
      const history = (await dailyBalanceHistoryStorage.getStore())
        .financialSnapshotsByAccountId!.a1!
      expect(history.map(({ generation }) => generation)).toEqual([
        0, 1, 47, 48, 49, 96,
      ])
      expect(
        history.find(({ generation }) => generation === 48)?.endedPositionKeys,
      ).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("persists USD reference snapshots alongside existing native history", async () => {
    const at = Date.UTC(2026, 1, 7, 12)
    const native = createNativeSnapshot("a1", at)
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
      schemaVersion: 3,
      snapshotsByAccountId: {
        a1: {
          "2026-02-07": {
            quota: 1_250_000,
            today_income: 750_000,
            today_quota_consumption: null,
            capturedAt: at,
            source: "refresh",
          },
        },
      },
      financialSnapshotsByAccountId: { a1: [native] },
    })

    const migrated = await dailyBalanceHistoryStorage.getStore()
    expect(migrated).toMatchObject({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {
        a1: {
          "2026-02-07": {
            balanceUsd: 2.5,
            incomeUsd: 1.5,
            consumptionUsd: null,
            capturedAt: at,
            source: "refresh",
          },
        },
      },
      financialSnapshotsByAccountId: { a1: [native] },
    })
    expect(migrated).not.toHaveProperty("snapshotsByAccountId")
    expect(storageData.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toEqual(
      migrated,
    )
    expect(await dailyBalanceHistoryStorage.getStore()).toEqual(migrated)
  })

  it("keeps the balance closest to a recorded provider billing boundary", async () => {
    const boundary = Date.UTC(2026, 1, 7, 9)
    const observedAt = boundary + 3_600_000
    vi.setSystemTime(observedAt)
    try {
      const entries = [-30, -5, 0, 4, 20].map((minutes) =>
        createNativeSnapshot("a1", boundary + minutes * 60_000),
      )
      storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: { a1: entries },
      })
      const snapshot = createNativeSnapshot("a1", observedAt)
      const [wallet] = snapshot.balance!.positions
      snapshot.settledConsumption = [
        {
          asset: wallet!.asset,
          scope: wallet!.scope,
          amount: observeAmount(
            "5",
            { ...wallet!.amount.source, operation: "spending" },
            observedAt,
          ),
          window: {
            start: boundary,
            end: observedAt,
            timeZone: "Pacific/Gambier",
          },
          settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
          coverage: FINANCIAL_COVERAGE.Complete,
          cumulative: true,
        },
      ]

      await expect(
        dailyBalanceHistoryStorage.appendFinancialSnapshot({
          accountId: "a1",
          snapshot,
          retentionDays: 30,
          timeZone: "UTC",
        }),
      ).resolves.toBe(true)

      const stored = await dailyBalanceHistoryStorage.getStore()
      const captures = stored.financialSnapshotsByAccountId?.a1?.map(
        (entry) => entry.balance?.capturedAt,
      )
      expect(captures).toContain(boundary)
      expect(captures!.length).toBeLessThan(entries.length + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    { retentionDays: 2, expiredDay: "2026-02-05", cutoffDay: "2026-02-06" },
    { retentionDays: 7300, expiredDay: "2006-02-12", cutoffDay: "2006-02-13" },
  ])(
    "prunes retained history on native append without creating a legacy daily row ($retentionDays days)",
    async ({ retentionDays, expiredDay, cutoffDay }) => {
      vi.useFakeTimers()
      const fixedNow = new Date(Date.UTC(2026, 1, 7, 12, 0, 0))
      vi.setSystemTime(fixedNow)

      try {
        storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
          schemaVersion: 3,
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

        const snapshot = createNativeSnapshot("a1", fixedNow.getTime())
        const ok = await dailyBalanceHistoryStorage.appendFinancialSnapshot({
          accountId: "a1",
          snapshot,
          retentionDays,
          timeZone: "UTC",
        })

        expect(ok).toBe(true)

        const store = await dailyBalanceHistoryStorage.getStore()
        expect(
          store.referenceSnapshotsByAccountId.a1?.[expiredDay],
        ).toBeUndefined()
        expect(
          store.referenceSnapshotsByAccountId.a1?.[cutoffDay]?.balanceUsd,
        ).toBe(0.000004)
        expect(
          store.referenceSnapshotsByAccountId.a1?.[todayKey],
        ).toBeUndefined()
        expect(store.financialSnapshotsByAccountId?.a1).toEqual([snapshot])
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it("returns false when an appended receipt is already outside retention", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-07T12:00:00Z"))
    try {
      expect(
        await dailyBalanceHistoryStorage.appendFinancialSnapshot({
          accountId: "a1",
          snapshot: createNativeSnapshot(
            "a1",
            Date.parse("2026-02-05T12:00:00Z"),
          ),
          retentionDays: 1,
          timeZone: "UTC",
        }),
      ).toBe(false)
      expect(
        (await dailyBalanceHistoryStorage.getStore())
          .financialSnapshotsByAccountId?.a1,
      ).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("drops malformed account buckets and snapshot rows while preserving null optional fields", async () => {
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
      schemaVersion: 1,
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
      financialSnapshotsByAccountId: {},
      referenceSnapshotsByAccountId: {
        accountValid: {
          "2026-02-11": {
            balanceUsd: 0.000016,
            incomeUsd: null,
            consumptionUsd: null,
            capturedAt: 123,
            source: "alarm",
          },
        },
      },
    })
  })

  it("prunes expired legacy rows and rejects native observations for another account", async () => {
    vi.useFakeTimers()
    const fixedNow = new Date(Date.UTC(2026, 1, 7, 12, 0, 0))
    vi.setSystemTime(fixedNow)

    try {
      storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, {
        schemaVersion: 3,
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
      expect(prunedStore.referenceSnapshotsByAccountId.pruneMe).toBeUndefined()
      expect(
        prunedStore.referenceSnapshotsByAccountId.keepMe?.["2026-02-07"],
      ).toEqual(
        expect.objectContaining({
          balanceUsd: 0.000004,
          source: "alarm",
        }),
      )

      await expect(
        dailyBalanceHistoryStorage.appendFinancialSnapshot({
          accountId: "keepMe",
          snapshot: createNativeSnapshot("another-account", fixedNow.getTime()),
          retentionDays: 1,
          timeZone: "UTC",
        }),
      ).resolves.toBe(false)

      expect(
        (await dailyBalanceHistoryStorage.getStore())
          .referenceSnapshotsByAccountId.keepMe,
      ).toEqual(prunedStore.referenceSnapshotsByAccountId.keepMe)
    } finally {
      vi.useRealTimers()
    }
  })
})

it.each([null, 0, false, "unrecognized-data"])(
  "preserves existing non-object history payload %j",
  async (payload) => {
    storageData.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, payload)
    await expect(dailyBalanceHistoryStorage.getStore()).rejects.toThrow(
      "invalid_balance_history_store",
    )
    expect(
      await dailyBalanceHistoryStorage.appendFinancialSnapshot({
        accountId: "a",
        snapshot: createNativeSnapshot("a", Date.now()),
        retentionDays: 30,
      }),
    ).toBe(false)
    expect(storageData.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toBe(
      payload,
    )
  },
)
