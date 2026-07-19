import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { isAccountTodayMetricAvailable } from "~/services/accounts/accountTodayStats"
import type { AccountStats } from "~/types"
import type { UsageHistoryStore } from "~/types/usageHistory"

import type { OptionsOverviewUsageSnapshot } from "./types"

/**
 * Builds the compact usage summary from current account stats and history.
 */
export function buildUsageSnapshot(
  accountStats: AccountStats,
  usageStore: UsageHistoryStore,
): OptionsOverviewUsageSnapshot {
  const sevenDay = sumLatestUsageDays(usageStore)
  const todayTokens =
    accountStats.today_total_prompt_tokens +
    accountStats.today_total_completion_tokens

  const hasTodayUsageData = [
    accountStats.todayStatsCoverage.requests,
    accountStats.todayStatsCoverage.tokens,
    accountStats.todayStatsCoverage.consumption,
  ].some(isAccountTodayMetricAvailable)

  return {
    todayRequests: accountStats.today_total_requests,
    todayTokens,
    todayCostText: formatQuotaCost(accountStats.today_total_consumption),
    todayRequestsCoverage: accountStats.todayStatsCoverage.requests,
    todayTokensCoverage: accountStats.todayStatsCoverage.tokens,
    todayCostCoverage: accountStats.todayStatsCoverage.consumption,
    sevenDayRequests: sevenDay.requests,
    sevenDayTokens: sevenDay.tokens,
    hasTodayUsageData,
    hasSevenDayUsageData: sevenDay.hasData,
    hasUsageData: hasTodayUsageData || sevenDay.hasData,
    target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
  }
}

/**
 * Sums the latest seven day buckets across all account usage stores.
 */
function sumLatestUsageDays(usageStore: UsageHistoryStore): {
  requests: number
  tokens: number
  hasData: boolean
} {
  const dayKeys = new Set<string>()

  for (const accountStore of Object.values(usageStore.accounts)) {
    for (const dayKey of Object.keys(accountStore.daily)) {
      dayKeys.add(dayKey)
    }
  }

  const latestDayKeys = [...dayKeys].sort().slice(-7)
  let requests = 0
  let tokens = 0

  for (const accountStore of Object.values(usageStore.accounts)) {
    for (const dayKey of latestDayKeys) {
      const aggregate = accountStore.daily[dayKey]
      if (!aggregate) continue
      requests += aggregate.requests
      tokens += aggregate.totalTokens
    }
  }

  return { requests, tokens, hasData: latestDayKeys.length > 0 }
}

/**
 * Formats raw quota consumption into a compact local fallback string.
 */
function formatQuotaCost(quota: number): string {
  if (!Number.isFinite(quota) || quota < 0) {
    return "-"
  }
  return quota.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
