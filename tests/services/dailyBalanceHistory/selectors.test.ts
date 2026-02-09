import { describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  buildAggregatedDailyBalanceMoneySeries,
  buildAggregatedDailyBalanceSeries,
} from "~/services/dailyBalanceHistory/selectors"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/dailyBalanceHistory"

const createStore = (
  snapshotsByAccountId: DailyBalanceHistoryStore["snapshotsByAccountId"],
): DailyBalanceHistoryStore => ({
  schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
  snapshotsByAccountId,
})

describe("dailyBalanceHistory selectors", () => {
  it("aggregates quota and cashflow when all accounts have complete snapshots", () => {
    const store = createStore({
      a1: {
        "2026-02-07": {
          quota: 10,
          today_income: 1,
          today_quota_consumption: 2,
          capturedAt: 0,
          source: "refresh",
        },
      },
      a2: {
        "2026-02-07": {
          quota: 20,
          today_income: 3,
          today_quota_consumption: 4,
          capturedAt: 0,
          source: "refresh",
        },
      },
    })

    const result = buildAggregatedDailyBalanceSeries({
      store,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
    })

    expect(result.dayKeys).toEqual(["2026-02-07"])
    expect(result.quotaTotals).toEqual([30])
    expect(result.incomeTotals).toEqual([4])
    expect(result.outcomeTotals).toEqual([6])
    expect(result.coverage).toEqual([
      { totalAccounts: 2, snapshotAccounts: 2, cashflowAccounts: 2 },
    ])
  })

  it("converts aggregated quota snapshots into USD amounts", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-07": {
          quota: 10 * factor,
          today_income: 1 * factor,
          today_quota_consumption: 2 * factor,
          capturedAt: 0,
          source: "refresh",
        },
      },
      a2: {
        "2026-02-07": {
          quota: 20 * factor,
          today_income: 3 * factor,
          today_quota_consumption: 4 * factor,
          capturedAt: 0,
          source: "refresh",
        },
      },
    })

    const result = buildAggregatedDailyBalanceMoneySeries({
      store,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "USD",
      exchangeRateByAccountId: { a1: 7, a2: 8 },
    })

    expect(result.balanceTotals).toEqual([30])
    expect(result.incomeTotals).toEqual([4])
    expect(result.outcomeTotals).toEqual([6])
  })

  it("converts aggregated quota snapshots into CNY amounts using per-account exchange rates", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-07": {
          quota: 10 * factor,
          today_income: 1 * factor,
          today_quota_consumption: 2 * factor,
          capturedAt: 0,
          source: "refresh",
        },
      },
      a2: {
        "2026-02-07": {
          quota: 20 * factor,
          today_income: 3 * factor,
          today_quota_consumption: 4 * factor,
          capturedAt: 0,
          source: "refresh",
        },
      },
    })

    const result = buildAggregatedDailyBalanceMoneySeries({
      store,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "CNY",
      exchangeRateByAccountId: new Map([
        ["a1", 7],
        ["a2", 8],
      ]),
    })

    expect(result.balanceTotals).toEqual([230])
    expect(result.incomeTotals).toEqual([31])
    expect(result.outcomeTotals).toEqual([46])
  })

  it("treats missing snapshots as gaps", () => {
    const store = createStore({
      a1: {
        "2026-02-07": {
          quota: 10,
          today_income: 1,
          today_quota_consumption: 2,
          capturedAt: 0,
          source: "refresh",
        },
      },
      a2: {},
    })

    const result = buildAggregatedDailyBalanceSeries({
      store,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
    })

    expect(result.quotaTotals).toEqual([null])
    expect(result.incomeTotals).toEqual([null])
    expect(result.outcomeTotals).toEqual([null])
    expect(result.coverage[0]).toEqual({
      totalAccounts: 2,
      snapshotAccounts: 1,
      cashflowAccounts: 1,
    })
  })

  it("treats missing cashflow values as gaps (even when snapshots exist)", () => {
    const store = createStore({
      a1: {
        "2026-02-07": {
          quota: 10,
          today_income: null,
          today_quota_consumption: null,
          capturedAt: 0,
          source: "refresh",
        },
      },
      a2: {
        "2026-02-07": {
          quota: 20,
          today_income: 3,
          today_quota_consumption: 4,
          capturedAt: 0,
          source: "refresh",
        },
      },
    })

    const result = buildAggregatedDailyBalanceSeries({
      store,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
    })

    expect(result.quotaTotals).toEqual([30])
    expect(result.incomeTotals).toEqual([null])
    expect(result.outcomeTotals).toEqual([null])
    expect(result.coverage[0]).toEqual({
      totalAccounts: 2,
      snapshotAccounts: 2,
      cashflowAccounts: 1,
    })
  })
})
