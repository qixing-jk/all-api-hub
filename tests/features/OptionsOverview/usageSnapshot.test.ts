import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { buildUsageSnapshot } from "~/features/OptionsOverview/usageSnapshot"
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
  quotaConsumed: 0,
})

describe("overview usage snapshot", () => {
  it("combines today's account stats with the latest seven usage-history day buckets", () => {
    const usageStore: UsageHistoryStore = {
      schemaVersion: 1,
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
      todayCostText: "1,234",
      todayRequestsCoverage: emptyStats.todayStatsCoverage.requests,
      todayTokensCoverage: emptyStats.todayStatsCoverage.tokens,
      todayCostCoverage: emptyStats.todayStatsCoverage.consumption,
      sevenDayRequests: 35,
      sevenDayTokens: 350,
      hasTodayUsageData: true,
      hasSevenDayUsageData: true,
      hasUsageData: true,
      target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
    })
  })

  it("distinguishes measured complete zeroes from unavailable today metrics", () => {
    expect(
      buildUsageSnapshot(emptyStats, {
        schemaVersion: 1,
        accounts: {},
      }),
    ).toEqual({
      todayRequests: 0,
      todayTokens: 0,
      todayCostText: "0",
      todayRequestsCoverage: emptyStats.todayStatsCoverage.requests,
      todayTokensCoverage: emptyStats.todayStatsCoverage.tokens,
      todayCostCoverage: emptyStats.todayStatsCoverage.consumption,
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
          schemaVersion: 1,
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
      schemaVersion: 1,
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
      todayCostText: "999",
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
        schemaVersion: 1,
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
      { schemaVersion: 1, accounts: {} },
    )

    expect(snapshot).toMatchObject({
      todayRequests: 5,
      todayTokens: 30,
      todayCostText: "50",
      todayRequestsCoverage: partialCoverage,
      todayTokensCoverage: partialCoverage,
      todayCostCoverage: partialCoverage,
      hasTodayUsageData: true,
    })
  })
})
