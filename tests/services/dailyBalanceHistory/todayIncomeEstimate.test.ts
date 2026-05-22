import { describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  buildEstimatedTodayIncomeMoneyTotals,
  convertQuotaToMoney,
  estimateTodayIncomeForAccount,
  hasManualBalance,
} from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/dailyBalanceHistory"

const createStore = (
  snapshotsByAccountId: DailyBalanceHistoryStore["snapshotsByAccountId"],
): DailyBalanceHistoryStore => ({
  schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
  snapshotsByAccountId,
})

const store = createStore({
  account: {
    "2026-05-22": {
      quota: 1_000_000,
      today_income: 0,
      today_quota_consumption: 0,
      capturedAt: 1,
      source: "alarm",
    },
    "2026-05-23": {
      quota: 1_600_000,
      today_income: 100_000,
      today_quota_consumption: 200_000,
      capturedAt: 2,
      source: "refresh",
    },
  },
})

const estimate = (
  overrides: Partial<Parameters<typeof estimateTodayIncomeForAccount>[0]> = {},
) =>
  estimateTodayIncomeForAccount({
    enabled: true,
    store,
    account: { id: "account", manualBalanceUsd: undefined },
    currentDayKey: "2026-05-23",
    ...overrides,
  })

describe("today income estimate", () => {
  it("estimates today's income from the current and previous-day snapshots", () => {
    expect(estimate()).toEqual({
      reportedTodayIncome: 100_000,
      estimatedTodayIncome: 800_000,
      compensation: 700_000,
      status: "available",
    })
  })

  it("returns disabled when the preference is off", () => {
    expect(estimate({ enabled: false })).toEqual({
      reportedTodayIncome: null,
      estimatedTodayIncome: null,
      compensation: null,
      status: "disabled",
    })
  })

  it("returns missing_current_snapshot when today has no snapshot", () => {
    expect(estimate({ currentDayKey: "2026-05-24" })).toEqual({
      reportedTodayIncome: null,
      estimatedTodayIncome: null,
      compensation: null,
      status: "missing_current_snapshot",
    })
  })

  it("returns missing_baseline and preserves reported income when previous-day baseline is absent", () => {
    expect(estimate({ currentDayKey: "2026-05-22" })).toEqual({
      reportedTodayIncome: 0,
      estimatedTodayIncome: null,
      compensation: null,
      status: "missing_baseline",
    })
  })

  it("does not fall back to older snapshots when the previous-day baseline is absent", () => {
    const olderOnlyStore = createStore({
      account: {
        "2026-05-21": {
          quota: 500_000,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 1,
          source: "alarm",
        },
        "2026-05-23": {
          quota: 1_600_000,
          today_income: 100_000,
          today_quota_consumption: 200_000,
          capturedAt: 2,
          source: "refresh",
        },
      },
    })

    expect(estimate({ store: olderOnlyStore })).toEqual({
      reportedTodayIncome: 100_000,
      estimatedTodayIncome: null,
      compensation: null,
      status: "missing_baseline",
    })
  })

  it("returns missing_cashflow and preserves reported income when current consumption is null", () => {
    const missingCashflowStore = createStore({
      account: {
        ...store.snapshotsByAccountId.account,
        "2026-05-23": {
          ...store.snapshotsByAccountId.account["2026-05-23"],
          today_quota_consumption: null,
        },
      },
    })

    expect(estimate({ store: missingCashflowStore })).toEqual({
      reportedTodayIncome: 100_000,
      estimatedTodayIncome: null,
      compensation: null,
      status: "missing_cashflow",
    })
  })

  it("returns manual_balance when the account has a non-empty manual balance", () => {
    expect(hasManualBalance({ manualBalanceUsd: " 1.23 " })).toBe(true)
    expect(hasManualBalance({ manualBalanceUsd: "   " })).toBe(false)
    expect(
      estimate({ account: { id: "account", manualBalanceUsd: " 1.23 " } }),
    ).toEqual({
      reportedTodayIncome: null,
      estimatedTodayIncome: null,
      compensation: null,
      status: "manual_balance",
    })
  })

  it("returns invalid_estimate and preserves reported income when the estimate is negative", () => {
    const negativeStore = createStore({
      account: {
        "2026-05-22": {
          quota: 1_000_000,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 1,
          source: "alarm",
        },
        "2026-05-23": {
          quota: 500_000,
          today_income: 100_000,
          today_quota_consumption: 0,
          capturedAt: 2,
          source: "refresh",
        },
      },
    })

    expect(estimate({ store: negativeStore })).toEqual({
      reportedTodayIncome: 100_000,
      estimatedTodayIncome: null,
      compensation: null,
      status: "invalid_estimate",
    })
  })

  it("returns invalid_estimate and preserves reported income when the estimate is non-finite", () => {
    const nonFiniteStore = createStore({
      account: {
        "2026-05-22": {
          quota: 1_000_000,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 1,
          source: "alarm",
        },
        "2026-05-23": {
          quota: Number.POSITIVE_INFINITY,
          today_income: 100_000,
          today_quota_consumption: 0,
          capturedAt: 2,
          source: "refresh",
        },
      },
    })

    expect(estimate({ store: nonFiniteStore })).toEqual({
      reportedTodayIncome: 100_000,
      estimatedTodayIncome: null,
      compensation: null,
      status: "invalid_estimate",
    })
  })

  it("uses null reported income for non-finite snapshot income", () => {
    const nonFiniteReportedIncomeStore = createStore({
      account: {
        "2026-05-22": {
          quota: 1_000_000,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 1,
          source: "alarm",
        },
        "2026-05-23": {
          quota: 1_600_000,
          today_income: Number.NaN,
          today_quota_consumption: 200_000,
          capturedAt: 2,
          source: "refresh",
        },
      },
    })

    expect(estimate({ store: nonFiniteReportedIncomeStore })).toEqual({
      reportedTodayIncome: null,
      estimatedTodayIncome: 800_000,
      compensation: null,
      status: "available",
    })

    expect(
      buildEstimatedTodayIncomeMoneyTotals({
        enabled: true,
        store: nonFiniteReportedIncomeStore,
        accounts: [
          { id: "account", exchange_rate: 5, manualBalanceUsd: undefined },
        ],
        currentDayKey: "2026-05-23",
      }),
    ).toEqual({
      trusted: { USD: 0, CNY: 0 },
      estimated: { USD: 1.6, CNY: 8 },
      availableAccounts: 1,
      totalAccounts: 1,
    })
  })

  it("converts quota values to USD and CNY money amounts", () => {
    const quota = 2 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR

    expect(convertQuotaToMoney({ quota, exchangeRate: 7 })).toEqual({
      USD: 2,
      CNY: 14,
    })
  })

  it("builds trusted totals from reported income and estimated totals from available estimates", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const totalsStore = createStore({
      a1: {
        "2026-05-22": {
          quota: 1 * factor,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 1,
          source: "alarm",
        },
        "2026-05-23": {
          quota: 1.6 * factor,
          today_income: 0.2 * factor,
          today_quota_consumption: 0.4 * factor,
          capturedAt: 2,
          source: "refresh",
        },
      },
      a2: {
        "2026-05-23": {
          quota: 3 * factor,
          today_income: 0.5 * factor,
          today_quota_consumption: 0.1 * factor,
          capturedAt: 2,
          source: "refresh",
        },
      },
    })

    expect(
      buildEstimatedTodayIncomeMoneyTotals({
        enabled: true,
        store: totalsStore,
        accounts: [
          { id: "a1", exchange_rate: 7, manualBalanceUsd: undefined },
          { id: "a2", exchange_rate: 8, manualBalanceUsd: undefined },
        ],
        currentDayKey: "2026-05-23",
      }),
    ).toEqual({
      trusted: { USD: 0.7, CNY: 5.4 },
      estimated: { USD: 1, CNY: 7 },
      availableAccounts: 1,
      totalAccounts: 2,
    })
  })

  it("does not trust raw snapshot income when estimate status nulls reported income", () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const totalsStore = createStore({
      disabled: {
        "2026-05-22": {
          quota: 1 * factor,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 1,
          source: "alarm",
        },
        "2026-05-23": {
          quota: 2 * factor,
          today_income: 0.5 * factor,
          today_quota_consumption: 0,
          capturedAt: 2,
          source: "refresh",
        },
      },
      manual: {
        "2026-05-22": {
          quota: 1 * factor,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: 1,
          source: "alarm",
        },
        "2026-05-23": {
          quota: 2 * factor,
          today_income: 0.75 * factor,
          today_quota_consumption: 0,
          capturedAt: 2,
          source: "refresh",
        },
      },
    })

    expect(
      buildEstimatedTodayIncomeMoneyTotals({
        enabled: false,
        store: totalsStore,
        accounts: [
          { id: "disabled", exchange_rate: 7, manualBalanceUsd: undefined },
        ],
        currentDayKey: "2026-05-23",
      }),
    ).toEqual({
      trusted: { USD: 0, CNY: 0 },
      estimated: null,
      availableAccounts: 0,
      totalAccounts: 1,
    })

    expect(
      buildEstimatedTodayIncomeMoneyTotals({
        enabled: true,
        store: totalsStore,
        accounts: [{ id: "manual", exchange_rate: 8, manualBalanceUsd: "1" }],
        currentDayKey: "2026-05-23",
      }),
    ).toEqual({
      trusted: { USD: 0, CNY: 0 },
      estimated: null,
      availableAccounts: 0,
      totalAccounts: 1,
    })
  })
})
