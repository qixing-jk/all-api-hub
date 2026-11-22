import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { buildUsageSnapshot } from "~/features/OptionsOverview/usage/usageSnapshot"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import type { AccountStats } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import type {
  UsageHistoryAggregate,
  UsageHistoryStore,
} from "~/types/usageHistory"
import { buildAccountStats } from "~~/tests/test-utils/accountTodayStats"

const emptyStats: AccountStats = buildAccountStats()
const unavailableCoverage = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  completeCount: 0,
  partialCount: 0,
  eligibleCount: 1,
  legacyUnclassifiedCount: 0,
} as const

const aggregate = (
  requests: number,
  totalTokens: number,
): UsageHistoryAggregate => ({
  requests,
  promptTokens: 0,
  completionTokens: totalTokens,
  totalTokens,
})

describe("overview usage snapshot", () => {
  it.each([
    ["1.23456789", /CNY\s*1.23456789/],
    ["0", /CNY\s*0$/],
  ] as const)(
    "preserves native currency amount %s and interval instead of displaying raw quota",
    (value, expected) => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const window = {
        start: start.getTime(),
        end: start.getTime() + 1000,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
      const scope = {
        subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "one" },
        authority: "https://wallet.example",
        models: { kind: SCOPE_SELECTION_KINDS.All },
        groups: { kind: SCOPE_SELECTION_KINDS.All },
        keys: { kind: SCOPE_SELECTION_KINDS.All },
        projects: { kind: SCOPE_SELECTION_KINDS.All },
      } as const
      const source = {
        adapter: "fixture",
        operation: "usage",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      } as const
      const consumptionProjection = getDisplayConsumptionProjection([
        {
          id: "one",
          settledConsumption: [
            {
              scope,
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
              amount: {
                status: OBSERVATION_STATUSES.Known,
                value,
                observedAt: Date.now(),
                source,
              },
              window,
              settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
              coverage: FINANCIAL_COVERAGE.Complete,
            },
          ],
        },
      ])
      const result = buildUsageSnapshot(
        {
          ...emptyStats,
          today_total_consumption: 617283945,
          consumptionProjection,
        },
        { schemaVersion: 3, accounts: {} },
      )
      expect(result.todayCostText).toMatch(expected)
      expect(result.todayCostGroups).toMatchObject([
        { amount: { value, asset: { kind: "currency", code: "CNY" } }, window },
      ])
      expect(result.todayCostCoverage.status).toBe("complete")
    },
  )
  it("combines today's account stats with the latest seven usage-history day buckets", () => {
    const usageStore: UsageHistoryStore = {
      schemaVersion: 3,
      accounts: {
        primary: {
          ...createEmptyUsageHistoryAccountStore(),
          daily: {
            "2026-05-24": aggregate(100, 1000),
            "2026-05-25": aggregate(1, 10),
            "2026-05-26": aggregate(2, 20),
            "2026-05-27": aggregate(3, 30),
          },
        },
        secondary: {
          ...createEmptyUsageHistoryAccountStore(),
          daily: {
            "2026-05-28": aggregate(4, 40),
            "2026-05-29": aggregate(5, 50),
            "2026-05-30": aggregate(6, 60),
            "2026-05-31": aggregate(7, 70),
            "2026-06-01": aggregate(8, 80),
          },
        },
      },
    }

    expect(
      buildUsageSnapshot(
        {
          ...emptyStats,
          today_total_consumption: 1234,
          today_total_requests: 12,
          today_total_prompt_tokens: 300,
          today_total_completion_tokens: 700,
        },
        usageStore,
      ),
    ).toEqual({
      todayRequests: 12,
      todayTokens: 1000,
      todayCostText: "-",
      todayRequestsCoverage: emptyStats.todayStatsCoverage.requests,
      todayTokensCoverage: emptyStats.todayStatsCoverage.tokens,
      todayCostCoverage: unavailableCoverage,
      sevenDayRequests: 35,
      sevenDayTokens: 350,
      hasTodayUsageData: true,
      hasSevenDayUsageData: true,
      hasUsageData: true,
      target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
    })
  })

  it("does not turn missing native amounts into complete zeroes", () => {
    expect(
      buildUsageSnapshot(emptyStats, {
        schemaVersion: 3,
        accounts: {},
      }),
    ).toEqual({
      todayRequests: 0,
      todayTokens: 0,
      todayCostText: "-",
      todayRequestsCoverage: emptyStats.todayStatsCoverage.requests,
      todayTokensCoverage: emptyStats.todayStatsCoverage.tokens,
      todayCostCoverage: unavailableCoverage,
      sevenDayRequests: 0,
      sevenDayTokens: 0,
      hasTodayUsageData: true,
      hasSevenDayUsageData: false,
      hasUsageData: true,
      target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
    })

    expect(
      buildUsageSnapshot(
        {
          ...emptyStats,
          today_total_consumption: Number.NaN,
        },
        {
          schemaVersion: 3,
          accounts: {},
        },
      ).todayCostText,
    ).toBe("-")
  })

  it("keeps seven-day history visible when today's metrics are unavailable", () => {
    const unavailableStats = buildAccountStats({
      today_total_consumption: 999,
      today_total_requests: 888,
      today_total_prompt_tokens: 777,
      today_total_completion_tokens: 666,
      todayStatsCoverage: {
        consumption: unavailableCoverage,
        requests: unavailableCoverage,
        tokens: unavailableCoverage,
        income: unavailableCoverage,
      },
    })
    const snapshot = buildUsageSnapshot(unavailableStats, {
      schemaVersion: 3,
      accounts: {
        primary: {
          ...createEmptyUsageHistoryAccountStore(),
          daily: {
            "2026-06-01": aggregate(1, 25),
          },
        },
      },
    })

    expect(snapshot).toMatchObject({
      todayRequests: 888,
      todayTokens: 1443,
      todayCostText: "-",
      todayRequestsCoverage: unavailableCoverage,
      sevenDayRequests: 1,
      sevenDayTokens: 25,
      hasTodayUsageData: false,
      hasSevenDayUsageData: true,
      hasUsageData: true,
    })
  })

  it("treats the snapshot as truly empty only when today and history are both absent", () => {
    const unavailableStats = buildAccountStats({
      todayStatsCoverage: {
        consumption: unavailableCoverage,
        requests: unavailableCoverage,
        tokens: unavailableCoverage,
        income: unavailableCoverage,
      },
    })

    expect(
      buildUsageSnapshot(unavailableStats, {
        schemaVersion: 3,
        accounts: {},
      }),
    ).toMatchObject({
      hasTodayUsageData: false,
      hasSevenDayUsageData: false,
      hasUsageData: false,
    })
  })

  it("preserves partial coverage for today's requests, tokens, and cost", () => {
    const partialCoverage = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
      completeCount: 1,
      partialCount: 1,
      eligibleCount: 3,
      legacyUnclassifiedCount: 0,
    } as const
    const snapshot = buildUsageSnapshot(
      buildAccountStats({
        today_total_consumption: 50,
        today_total_requests: 5,
        today_total_prompt_tokens: 10,
        today_total_completion_tokens: 20,
        todayStatsCoverage: {
          ...emptyStats.todayStatsCoverage,
          consumption: partialCoverage,
          requests: partialCoverage,
          tokens: partialCoverage,
        },
      }),
      { schemaVersion: 3, accounts: {} },
    )

    expect(snapshot).toMatchObject({
      todayRequests: 5,
      todayTokens: 30,
      todayCostText: "-",
      todayRequestsCoverage: partialCoverage,
      todayTokensCoverage: partialCoverage,
      todayCostCoverage: {
        ...partialCoverage,
        status: "unavailable",
        completeCount: 0,
        partialCount: 0,
      },
      hasTodayUsageData: true,
    })
  })
})
