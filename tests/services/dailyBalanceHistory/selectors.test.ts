import { describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  buildAccountRangeSummaries,
  buildAggregatedDailyBalanceMoneySeries,
  buildAggregatedDailyBalanceSeries,
  buildPerAccountDailyBalanceMoneySeries,
} from "~/services/history/dailyBalanceHistory/selectors"
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
      {
        totalAccounts: 2,
        snapshotAccounts: 2,
        cashflowAccounts: 2,
        incomeAccounts: 2,
        outcomeAccounts: 2,
        estimatedIncomeAccounts: 0,
      },
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
      incomeAccounts: 1,
      outcomeAccounts: 1,
      estimatedIncomeAccounts: 0,
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
      incomeAccounts: 1,
      outcomeAccounts: 1,
      estimatedIncomeAccounts: 0,
    })
  })

  it.each([
    {
      label: "income without outcome",
      today_income: 3,
      today_quota_consumption: null,
      expectedIncome: 4,
      expectedOutcome: null,
      expectedIncomeAccounts: 2,
      expectedOutcomeAccounts: 1,
    },
    {
      label: "outcome without income",
      today_income: null,
      today_quota_consumption: 4,
      expectedIncome: null,
      expectedOutcome: 6,
      expectedIncomeAccounts: 1,
      expectedOutcomeAccounts: 2,
    },
  ])(
    "keeps aggregate $label available independently",
    ({
      today_income,
      today_quota_consumption,
      expectedIncome,
      expectedOutcome,
      expectedIncomeAccounts,
      expectedOutcomeAccounts,
    }) => {
      const result = buildAggregatedDailyBalanceSeries({
        store: createStore({
          a1: {
            "2026-02-07": {
              quota: 10,
              today_income,
              today_quota_consumption,
              capturedAt: 0,
              source: "refresh",
            },
          },
          a2: {
            "2026-02-07": {
              quota: 20,
              today_income: 1,
              today_quota_consumption: 2,
              capturedAt: 0,
              source: "refresh",
            },
          },
        }),
        accountIds: ["a1", "a2"],
        startDayKey: "2026-02-07",
        endDayKey: "2026-02-07",
      })

      expect(result.incomeTotals).toEqual([expectedIncome])
      expect(result.outcomeTotals).toEqual([expectedOutcome])
      expect(result.coverage[0]).toMatchObject({
        cashflowAccounts: 1,
        incomeAccounts: expectedIncomeAccounts,
        outcomeAccounts: expectedOutcomeAccounts,
      })
    },
  )

  it.each([
    {
      label: "income without outcome",
      today_income: 3,
      today_quota_consumption: null,
      expectedIncome: 4,
      expectedOutcome: null,
    },
    {
      label: "outcome without income",
      today_income: null,
      today_quota_consumption: 4,
      expectedIncome: null,
      expectedOutcome: 6,
    },
  ])(
    "keeps money aggregate $label available independently",
    ({
      today_income,
      today_quota_consumption,
      expectedIncome,
      expectedOutcome,
    }) => {
      const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
      const result = buildAggregatedDailyBalanceMoneySeries({
        store: createStore({
          a1: {
            "2026-02-07": {
              quota: 10 * factor,
              today_income:
                today_income === null ? null : today_income * factor,
              today_quota_consumption:
                today_quota_consumption === null
                  ? null
                  : today_quota_consumption * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
          a2: {
            "2026-02-07": {
              quota: 20 * factor,
              today_income: 1 * factor,
              today_quota_consumption: 2 * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
        }),
        accountIds: ["a1", "a2"],
        startDayKey: "2026-02-07",
        endDayKey: "2026-02-07",
        currencyType: "USD",
      })

      expect(result.incomeTotals).toEqual([expectedIncome])
      expect(result.outcomeTotals).toEqual([expectedOutcome])
    },
  )

  it("returns null aggregate totals with zero coverage when no store is available", () => {
    const result = buildAggregatedDailyBalanceSeries({
      store: null,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-08",
    })

    expect(result.dayKeys).toEqual(["2026-02-07", "2026-02-08"])
    expect(result.quotaTotals).toEqual([null, null])
    expect(result.incomeTotals).toEqual([null, null])
    expect(result.outcomeTotals).toEqual([null, null])
    expect(result.coverage).toEqual([
      {
        totalAccounts: 2,
        snapshotAccounts: 0,
        cashflowAccounts: 0,
        incomeAccounts: 0,
        outcomeAccounts: 0,
        estimatedIncomeAccounts: 0,
      },
      {
        totalAccounts: 2,
        snapshotAccounts: 0,
        cashflowAccounts: 0,
        incomeAccounts: 0,
        outcomeAccounts: 0,
        estimatedIncomeAccounts: 0,
      },
    ])
  })

  it("returns null money totals with zero coverage when the store is unavailable", () => {
    const result = buildAggregatedDailyBalanceMoneySeries({
      store: null,
      accountIds: ["a1", "a2"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-08",
      currencyType: "USD",
    })

    expect(result.dayKeys).toEqual(["2026-02-07", "2026-02-08"])
    expect(result.balanceTotals).toEqual([null, null])
    expect(result.incomeTotals).toEqual([null, null])
    expect(result.outcomeTotals).toEqual([null, null])
    expect(result.coverage).toEqual([
      {
        totalAccounts: 2,
        snapshotAccounts: 0,
        cashflowAccounts: 0,
        incomeAccounts: 0,
        outcomeAccounts: 0,
        estimatedIncomeAccounts: 0,
      },
      {
        totalAccounts: 2,
        snapshotAccounts: 0,
        cashflowAccounts: 0,
        incomeAccounts: 0,
        outcomeAccounts: 0,
        estimatedIncomeAccounts: 0,
      },
    ])
  })

  it("falls back to the default exchange rate when a CNY account rate is missing or invalid", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-07": {
          quota: 2 * factor,
          today_income: 1 * factor,
          today_quota_consumption: 0.5 * factor,
          capturedAt: 0,
          source: "refresh",
        },
      },
      a2: {
        "2026-02-07": {
          quota: 3 * factor,
          today_income: 2 * factor,
          today_quota_consumption: 1 * factor,
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
      exchangeRateByAccountId: {
        a1: 0,
        a2: Number.NaN,
      },
    })

    const fallbackRate = UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
    expect(result.balanceTotals).toEqual([(2 + 3) * fallbackRate])
    expect(result.incomeTotals).toEqual([(1 + 2) * fallbackRate])
    expect(result.outcomeTotals).toEqual([(0.5 + 1) * fallbackRate])
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
      {
        totalAccounts: 2,
        snapshotAccounts: 1,
        cashflowAccounts: 1,
        incomeAccounts: 1,
        outcomeAccounts: 1,
        estimatedIncomeAccounts: 0,
      },
    ])
    expect(result.seriesByAccountId.a1.balance).toEqual([10])
    expect(result.seriesByAccountId.a2.balance).toEqual([null])
    expect(result.seriesByAccountId.a1.income).toEqual([1])
    expect(result.seriesByAccountId.a1.outcome).toEqual([2])
    expect(result.seriesByAccountId.a1.net).toEqual([-1])
  })

  it.each([
    {
      label: "income without outcome",
      today_income: 3,
      today_quota_consumption: null,
      expectedIncome: 3,
      expectedOutcome: null,
      expectedIncomeAccounts: 1,
      expectedOutcomeAccounts: 0,
    },
    {
      label: "outcome without income",
      today_income: null,
      today_quota_consumption: 4,
      expectedIncome: null,
      expectedOutcome: 4,
      expectedIncomeAccounts: 0,
      expectedOutcomeAccounts: 1,
    },
  ])(
    "keeps per-account $label available without manufacturing net",
    ({
      today_income,
      today_quota_consumption,
      expectedIncome,
      expectedOutcome,
      expectedIncomeAccounts,
      expectedOutcomeAccounts,
    }) => {
      const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
      const result = buildPerAccountDailyBalanceMoneySeries({
        store: createStore({
          a1: {
            "2026-02-07": {
              quota: 10 * factor,
              today_income:
                today_income === null ? null : today_income * factor,
              today_quota_consumption:
                today_quota_consumption === null
                  ? null
                  : today_quota_consumption * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
        }),
        accountIds: ["a1"],
        startDayKey: "2026-02-07",
        endDayKey: "2026-02-07",
        currencyType: "USD",
      })

      expect(result.seriesByAccountId.a1.income).toEqual([expectedIncome])
      expect(result.seriesByAccountId.a1.outcome).toEqual([expectedOutcome])
      expect(result.seriesByAccountId.a1.net).toEqual([null])
      expect(result.coverageByDay[0]).toMatchObject({
        cashflowAccounts: 0,
        incomeAccounts: expectedIncomeAccounts,
        outcomeAccounts: expectedOutcomeAccounts,
      })
    },
  )

  it("builds estimated income per-account series without changing trusted income", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-06": {
          quota: 10 * factor,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 0,
          source: "alarm",
        },
        "2026-02-07": {
          quota: 12 * factor,
          today_income: 0.5 * factor,
          today_quota_consumption: 1 * factor,
          capturedAt: 1,
          source: "refresh",
        },
      },
    })

    const result = buildPerAccountDailyBalanceMoneySeries({
      store,
      accountIds: ["a1"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "USD",
      estimatedTodayIncomeEnabled: true,
    })

    expect(result.seriesByAccountId.a1.income).toEqual([0.5])
    expect(result.seriesByAccountId.a1.estimatedIncome).toEqual([3])
    expect(result.seriesByAccountId.a1.outcome).toEqual([1])
    expect(result.seriesByAccountId.a1.net).toEqual([-0.5])
    expect(result.coverageByDay[0]).toMatchObject({
      cashflowAccounts: 1,
      estimatedIncomeAccounts: 1,
    })
  })

  it("returns null estimated income per-account series when estimates are disabled", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-06": {
          quota: 10 * factor,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 0,
          source: "alarm",
        },
        "2026-02-07": {
          quota: 12 * factor,
          today_income: 0.5 * factor,
          today_quota_consumption: 1 * factor,
          capturedAt: 1,
          source: "refresh",
        },
      },
    })

    const result = buildPerAccountDailyBalanceMoneySeries({
      store,
      accountIds: ["a1"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "USD",
      estimatedTodayIncomeEnabled: false,
    })

    expect(result.seriesByAccountId.a1.income).toEqual([0.5])
    expect(result.seriesByAccountId.a1.estimatedIncome).toEqual([null])
    expect(result.coverageByDay[0]).toMatchObject({
      cashflowAccounts: 1,
      estimatedIncomeAccounts: 0,
    })
  })

  it("returns null estimated income for manual balance accounts", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-06": {
          quota: 10 * factor,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 0,
          source: "alarm",
        },
        "2026-02-07": {
          quota: 12 * factor,
          today_income: 0.5 * factor,
          today_quota_consumption: 1 * factor,
          capturedAt: 1,
          source: "refresh",
        },
      },
    })

    const result = buildPerAccountDailyBalanceMoneySeries({
      store,
      accountIds: ["a1"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "USD",
      estimatedTodayIncomeEnabled: true,
      manualBalanceAccountIds: new Set(["a1"]),
    })

    expect(result.seriesByAccountId.a1.income).toEqual([0.5])
    expect(result.seriesByAccountId.a1.estimatedIncome).toEqual([null])
    expect(result.coverageByDay[0]).toMatchObject({
      cashflowAccounts: 1,
      estimatedIncomeAccounts: 0,
    })
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

  it("returns empty per-account series structures for empty selections", () => {
    const result = buildPerAccountDailyBalanceMoneySeries({
      store: null,
      accountIds: [],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-08",
      currencyType: "USD",
    })

    expect(result.dayKeys).toEqual(["2026-02-07", "2026-02-08"])
    expect(result.seriesByAccountId).toEqual({})
    expect(result.coverageByDay).toEqual([
      {
        totalAccounts: 0,
        snapshotAccounts: 0,
        cashflowAccounts: 0,
        incomeAccounts: 0,
        outcomeAccounts: 0,
        estimatedIncomeAccounts: 0,
      },
      {
        totalAccounts: 0,
        snapshotAccounts: 0,
        cashflowAccounts: 0,
        incomeAccounts: 0,
        outcomeAccounts: 0,
        estimatedIncomeAccounts: 0,
      },
    ])
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
        estimatedIncomeTotal: null,
        outcomeTotal: 0.5,
        netTotal: 0.5,
        snapshotDays: 2,
        cashflowDays: 1,
        incomeDays: 1,
        outcomeDays: 1,
        estimatedIncomeDays: 0,
        totalDays: 2,
      },
      {
        accountId: "a2",
        startBalance: null,
        endBalance: 20,
        incomeTotal: 2,
        estimatedIncomeTotal: null,
        outcomeTotal: 1,
        netTotal: 1,
        snapshotDays: 1,
        cashflowDays: 1,
        incomeDays: 1,
        outcomeDays: 1,
        estimatedIncomeDays: 0,
        totalDays: 2,
      },
    ])
  })

  it.each([
    {
      label: "income without outcome",
      today_income: 3,
      today_quota_consumption: null,
      expectedIncome: 3,
      expectedOutcome: null,
      expectedIncomeDays: 1,
      expectedOutcomeDays: 0,
    },
    {
      label: "outcome without income",
      today_income: null,
      today_quota_consumption: 4,
      expectedIncome: null,
      expectedOutcome: 4,
      expectedIncomeDays: 0,
      expectedOutcomeDays: 1,
    },
  ])(
    "summarizes $label independently without manufacturing net",
    ({
      today_income,
      today_quota_consumption,
      expectedIncome,
      expectedOutcome,
      expectedIncomeDays,
      expectedOutcomeDays,
    }) => {
      const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
      const result = buildAccountRangeSummaries({
        store: createStore({
          a1: {
            "2026-02-07": {
              quota: 10 * factor,
              today_income:
                today_income === null ? null : today_income * factor,
              today_quota_consumption:
                today_quota_consumption === null
                  ? null
                  : today_quota_consumption * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
        }),
        accountIds: ["a1"],
        startDayKey: "2026-02-07",
        endDayKey: "2026-02-07",
        currencyType: "USD",
      })

      expect(result.summaries[0]).toMatchObject({
        incomeTotal: expectedIncome,
        outcomeTotal: expectedOutcome,
        netTotal: null,
        incomeDays: expectedIncomeDays,
        outcomeDays: expectedOutcomeDays,
        cashflowDays: 0,
      })
    },
  )

  it("sums range net only from days with paired income and outcome", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const result = buildAccountRangeSummaries({
      store: createStore({
        a1: {
          "2026-02-07": {
            quota: 10 * factor,
            today_income: 1 * factor,
            today_quota_consumption: 2 * factor,
            capturedAt: 0,
            source: "refresh",
          },
          "2026-02-08": {
            quota: 11 * factor,
            today_income: 3 * factor,
            today_quota_consumption: null,
            capturedAt: 0,
            source: "refresh",
          },
          "2026-02-09": {
            quota: 12 * factor,
            today_income: null,
            today_quota_consumption: 4 * factor,
            capturedAt: 0,
            source: "refresh",
          },
        },
      }),
      accountIds: ["a1"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-09",
      currencyType: "USD",
    })

    expect(result.summaries[0]).toMatchObject({
      incomeTotal: 4,
      outcomeTotal: 6,
      netTotal: -1,
      incomeDays: 2,
      outcomeDays: 2,
      cashflowDays: 1,
    })
  })

  it("summarizes estimated income separately from trusted income", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-06": {
          quota: 10 * factor,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 0,
          source: "alarm",
        },
        "2026-02-07": {
          quota: 12 * factor,
          today_income: 0.5 * factor,
          today_quota_consumption: 1 * factor,
          capturedAt: 1,
          source: "refresh",
        },
      },
    })

    const result = buildAccountRangeSummaries({
      store,
      accountIds: ["a1"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "USD",
      estimatedTodayIncomeEnabled: true,
    })

    expect(result.summaries[0].incomeTotal).toBe(0.5)
    expect(result.summaries[0].estimatedIncomeTotal).toBe(3)
    expect(result.summaries[0].estimatedIncomeDays).toBe(1)
    expect(result.summaries[0].outcomeTotal).toBe(1)
    expect(result.summaries[0].netTotal).toBe(-0.5)
  })

  it("excludes disabled estimated income from range summaries", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const store = createStore({
      a1: {
        "2026-02-06": {
          quota: 10 * factor,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 0,
          source: "alarm",
        },
        "2026-02-07": {
          quota: 12 * factor,
          today_income: 0.5 * factor,
          today_quota_consumption: 1 * factor,
          capturedAt: 1,
          source: "refresh",
        },
      },
    })

    const result = buildAccountRangeSummaries({
      store,
      accountIds: ["a1"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-07",
      currencyType: "USD",
      estimatedTodayIncomeEnabled: false,
    })

    expect(result.summaries[0].incomeTotal).toBe(0.5)
    expect(result.summaries[0].estimatedIncomeTotal).toBeNull()
    expect(result.summaries[0].estimatedIncomeDays).toBe(0)
  })

  it("returns null summary totals when an account has no snapshots in the selected range", () => {
    const result = buildAccountRangeSummaries({
      store: null,
      accountIds: ["a1"],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-08",
      currencyType: "CNY",
      exchangeRateByAccountId: new Map([["a1", 8]]),
    })

    expect(result.dayKeys).toEqual(["2026-02-07", "2026-02-08"])
    expect(result.summaries).toEqual([
      {
        accountId: "a1",
        startBalance: null,
        endBalance: null,
        incomeTotal: null,
        estimatedIncomeTotal: null,
        outcomeTotal: null,
        netTotal: null,
        snapshotDays: 0,
        cashflowDays: 0,
        incomeDays: 0,
        outcomeDays: 0,
        estimatedIncomeDays: 0,
        totalDays: 2,
      },
    ])
  })

  it("returns no summaries when the selection is empty", () => {
    const result = buildAccountRangeSummaries({
      store: createStore({}),
      accountIds: [],
      startDayKey: "2026-02-07",
      endDayKey: "2026-02-08",
      currencyType: "USD",
    })

    expect(result).toEqual({
      dayKeys: ["2026-02-07", "2026-02-08"],
      summaries: [],
    })
  })
})
