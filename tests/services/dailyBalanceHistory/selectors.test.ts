import { describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  buildAccountRangeSummaries,
  buildAggregatedDailyBalanceMoneySeries,
  buildAggregatedDailyBalanceSeries,
  buildPerAccountDailyBalanceMoneySeries,
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

  it("builds per-account daily series with per-account gaps (does not blank other accounts)", () => {
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
      a2: {},
    })

    const result = buildPerAccountDailyBalanceMoneySeries({
      store,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "USD",
    })

    expect(result.dayKeys).toEqual(["2026-02-07"])
    expect(result.coverageByDay).toEqual([
      { totalAccounts: 2, snapshotAccounts: 1, cashflowAccounts: 1 },
    ])
    expect(result.seriesByAccountId.a1.balance).toEqual([10])
    expect(result.seriesByAccountId.a2.balance).toEqual([null])
    expect(result.seriesByAccountId.a1.income).toEqual([1])
    expect(result.seriesByAccountId.a1.outcome).toEqual([2])
    expect(result.seriesByAccountId.a1.net).toEqual([-1])
  })

  it("converts per-account daily series into CNY using per-account exchange rates", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-07": {
          quota: 1 * factor,
          today_income: 1 * factor,
          today_quota_consumption: 2 * factor,
          capturedAt: 0,
          source: "refresh",
        },
      },
      a2: {
        "2026-02-07": {
          quota: 2 * factor,
          today_income: 3 * factor,
          today_quota_consumption: 4 * factor,
          capturedAt: 0,
          source: "refresh",
        },
      },
    })

    const result = buildPerAccountDailyBalanceMoneySeries({
      store,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "CNY",
      exchangeRateByAccountId: { a1: 7, a2: 8 },
    })

    expect(result.seriesByAccountId.a1.balance).toEqual([7])
    expect(result.seriesByAccountId.a2.balance).toEqual([16])
    expect(result.seriesByAccountId.a1.net).toEqual([-7])
    expect(result.seriesByAccountId.a2.net).toEqual([-8])
  })

  it("summarizes per-account range totals and coverage", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-07": {
          quota: 10 * factor,
          today_income: 1 * factor,
          today_quota_consumption: 0.5 * factor,
          capturedAt: 0,
          source: "refresh",
        },
        "2026-02-08": {
          quota: 15 * factor,
          today_income: null,
          today_quota_consumption: null,
          capturedAt: 0,
          source: "refresh",
        },
      },
      a2: {
        "2026-02-08": {
          quota: 20 * factor,
          today_income: 2 * factor,
          today_quota_consumption: 1 * factor,
          capturedAt: 0,
          source: "refresh",
        },
      },
    })

    const result = buildAccountRangeSummaries({
      store,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-08",
      currencyType: "USD",
    })

    expect(result.dayKeys).toEqual(["2026-02-07", "2026-02-08"])
    expect(result.summaries).toEqual([
      {
        accountId: "a1",
        startBalance: 10,
        endBalance: 15,
        incomeTotal: 1,
        outcomeTotal: 0.5,
        netTotal: 0.5,
        snapshotDays: 2,
        cashflowDays: 1,
        totalDays: 2,
      },
      {
        accountId: "a2",
        startBalance: null,
        endBalance: 20,
        incomeTotal: 2,
        outcomeTotal: 1,
        netTotal: 1,
        snapshotDays: 1,
        cashflowDays: 1,
        totalDays: 2,
      },
    ])
  })
})
