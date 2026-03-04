import { describe, expect, it } from "vitest"

import { computeUsageHistoryExport } from "~/services/history/usageHistory/analytics"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import {
  USAGE_HISTORY_EXPORT_SCHEMA_VERSION,
  USAGE_HISTORY_STORE_SCHEMA_VERSION,
  UsageHistoryStore,
} from "~/types/usageHistory"

describe("usageHistory analytics", () => {
  it("builds a versioned export and fuses aggregates across accounts", () => {
    const a1 = createEmptyUsageHistoryAccountStore()
    a1.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      quotaConsumed: 5,
    }
    a1.daily["2026-01-02"] = {
      requests: 100,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      quotaConsumed: 0,
    }
    a1.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...a1.daily["2026-01-01"] },
      "2026-01-02": { ...a1.daily["2026-01-02"] },
    }

    const a2 = createEmptyUsageHistoryAccountStore()
    a2.daily["2026-01-01"] = {
      requests: 2,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      quotaConsumed: 7,
    }
    a2.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...a2.daily["2026-01-01"] },
    }

    const store: UsageHistoryStore = {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {
        a1,
        a2,
      },
    }

    const exportData = computeUsageHistoryExport({
      store,
      selection: {
        accountIds: [],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      },
    })

    expect(exportData.schemaVersion).toBe(USAGE_HISTORY_EXPORT_SCHEMA_VERSION)
    expect(exportData.selection.accountIds).toEqual(["a1", "a2"])
    expect(exportData.selection.startDay).toBe("2026-01-01")
    expect(exportData.selection.endDay).toBe("2026-01-01")

    expect(exportData.fused.daily["2026-01-01"]).toMatchObject({
      requests: 3,
      totalTokens: 32,
      quotaConsumed: 12,
    })
    expect(exportData.fused.daily["2026-01-02"]).toBeUndefined()

    expect(exportData.fused.byModel["gpt-4"]).toMatchObject({
      requests: 3,
      totalTokens: 32,
    })

    expect(exportData.accounts.a1.daily["2026-01-02"]).toBeUndefined()
    expect(exportData.accounts.a2.daily["2026-01-02"]).toBeUndefined()
  })

  it("throws when the export day range is invalid", () => {
    const store: UsageHistoryStore = {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {},
    }

    expect(() =>
      computeUsageHistoryExport({
        store,
        selection: { accountIds: [], startDay: "bad", endDay: "2026-01-01" },
      }),
    ).toThrow("Invalid export day range")

    expect(() =>
      computeUsageHistoryExport({
        store,
        selection: {
          accountIds: [],
          startDay: "2026-01-02",
          endDay: "2026-01-01",
        },
      }),
    ).toThrow("Invalid export day range")
  })

  it("fuses token names, per-token totals, and pads latency buckets when needed", () => {
    const dayKey = "2026-01-01"

    const a1 = createEmptyUsageHistoryAccountStore()
    a1.tokenNamesById["1"] = "Token A"
    a1.dailyByToken["1"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        quotaConsumed: 1,
      },
    }
    a1.latencyDaily[dayKey] = {
      count: 1,
      sum: 1,
      max: 1,
      slowCount: 0,
      unknownCount: 0,
      // Simulate a future schema with more histogram buckets than the current code.
      buckets: Array.from({ length: 13 }, (_, index) => (index === 0 ? 1 : 0)),
    }

    const a2 = createEmptyUsageHistoryAccountStore()
    // Same token id but a different label should not override the fused name.
    a2.tokenNamesById["1"] = "Token A (newer)"
    a2.dailyByToken["1"] = {
      [dayKey]: {
        requests: 2,
        promptTokens: 0,
        completionTokens: 3,
        totalTokens: 3,
        quotaConsumed: 2,
      },
    }
    a2.latencyDaily[dayKey] = {
      count: 1,
      sum: 2,
      max: 2,
      slowCount: 1,
      unknownCount: 0,
      buckets: [0, 1],
    }

    const store: UsageHistoryStore = {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: { a1, a2 },
    }

    const exportData = computeUsageHistoryExport({
      store,
      selection: { accountIds: [], startDay: dayKey, endDay: dayKey },
    })

    expect(exportData.fused.tokenNamesById["1"]).toBe("Token A")
    expect(exportData.fused.byToken["1"]).toMatchObject({
      requests: 3,
      totalTokens: 5,
      quotaConsumed: 3,
    })

    expect(exportData.fused.latencyDaily[dayKey]).toMatchObject({
      count: 2,
      sum: 3,
      max: 2,
      slowCount: 1,
    })
    expect(exportData.fused.latencyDaily[dayKey].buckets.length).toBe(13)
  })

  it("ignores missing accounts during fusion but preserves the selection list", () => {
    const a1 = createEmptyUsageHistoryAccountStore()
    a1.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 1,
      completionTokens: 0,
      totalTokens: 1,
      quotaConsumed: 1,
    }

    const store: UsageHistoryStore = {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: { a1 },
    }

    const exportData = computeUsageHistoryExport({
      store,
      selection: {
        accountIds: ["missing", "a1"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      },
    })

    expect(exportData.selection.accountIds).toEqual(["missing", "a1"])
    expect(Object.keys(exportData.accounts)).toEqual(["a1"])
    expect(exportData.fused.daily["2026-01-01"]).toMatchObject({
      requests: 1,
      totalTokens: 1,
      quotaConsumed: 1,
    })
  })

  it("filters and fuses hourly aggregates within the selection window", () => {
    const a1 = createEmptyUsageHistoryAccountStore()
    a1.hourly["2026-01-01"] = {
      "00": {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        quotaConsumed: 0,
      },
    }
    a1.hourly["2026-01-02"] = {
      "00": {
        requests: 999,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        quotaConsumed: 0,
      },
    }

    const store: UsageHistoryStore = {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: { a1 },
    }

    const exportData = computeUsageHistoryExport({
      store,
      selection: {
        accountIds: ["a1"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      },
    })

    expect(exportData.accounts.a1.hourly["2026-01-02"]).toBeUndefined()
    expect(exportData.fused.hourly["2026-01-01"]["00"]).toMatchObject({
      requests: 1,
    })
    expect(exportData.fused.hourly["2026-01-02"]).toBeUndefined()
  })
})
