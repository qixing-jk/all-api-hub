import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { buildUsageSnapshot } from "~/features/OptionsOverview/usageSnapshot"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import type { AccountStats } from "~/types"
import type {
  UsageHistoryAggregate,
  UsageHistoryStore,
} from "~/types/usageHistory"
import { buildAccountStats } from "~~/tests/test-utils/accountTodayStats"

const emptyStats: AccountStats = buildAccountStats()

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
      sevenDayRequests: 35,
      sevenDayTokens: 350,
      hasUsageData: true,
      target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
    })
  })

  it("treats empty and non-positive usage as no usage data with a local cost fallback", () => {
    expect(
      buildUsageSnapshot(emptyStats, {
        schemaVersion: 1,
        accounts: {},
      }),
    ).toEqual({
      todayRequests: 0,
      todayTokens: 0,
      todayCostText: "-",
      sevenDayRequests: 0,
      sevenDayTokens: 0,
      hasUsageData: false,
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

  it("marks history-only usage as available", () => {
    expect(
      buildUsageSnapshot(emptyStats, {
        schemaVersion: 1,
        accounts: {
          primary: {
            ...createEmptyUsageHistoryAccountStore(),
            daily: {
              "2026-06-01": aggregate(1, 25),
            },
          },
        },
      }).hasUsageData,
    ).toBe(true)
  })
})
