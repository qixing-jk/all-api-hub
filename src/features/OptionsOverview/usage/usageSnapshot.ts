import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { OptionsOverviewUsageSnapshot } from "~/features/OptionsOverview/types"
import { isAccountTodayMetricAvailable } from "~/services/accounts/metrics/accountTodayStats"
import { normalizeDecimalUnits } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import type { AccountStats } from "~/types"
import type { UsageHistoryStore } from "~/types/usageHistory"
import { formatAssetAmount } from "~/utils/core/money"

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
  const todayCostGroups = accountStats.consumptionProjection?.groups ?? []
  const referenceUsd = normalizeDecimalUnits(
    accountStats.referenceTodayConsumption?.quota,
    QUOTA_PER_USD,
  )
  const todayReferenceCostText =
    referenceUsd === undefined
      ? undefined
      : formatAssetAmount({
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          value: referenceUsd,
        })
  const todayCostCoverage = accountStats.consumptionProjection
    ?.nativeCoverage ?? {
    ...accountStats.todayStatsCoverage.consumption,
    status: FINANCIAL_ENUMERATION.Unavailable,
    completeCount: 0,
    partialCount: 0,
  }

  const hasTodayUsageData =
    todayReferenceCostText !== undefined ||
    [
      accountStats.todayStatsCoverage.requests,
      accountStats.todayStatsCoverage.tokens,
      todayCostCoverage,
    ].some(isAccountTodayMetricAvailable)

  return {
    ...(accountStats.siteDayUsage?.length
      ? { siteDayUsage: accountStats.siteDayUsage }
      : {}),
    todayRequests: accountStats.today_total_requests,
    todayTokens,
    todayCostText: todayCostGroups.length
      ? todayCostGroups
          .map((group) => formatAssetAmount(group.amount))
          .join(" · ")
      : "-",
    ...(todayCostGroups.length ? { todayCostGroups } : {}),
    ...(todayReferenceCostText === undefined ||
    !accountStats.referenceTodayConsumption
      ? {}
      : {
          todayReferenceCost: {
            text: todayReferenceCostText,
            coverage: accountStats.referenceTodayConsumption.coverage,
          },
        }),
    todayRequestsCoverage: accountStats.todayStatsCoverage.requests,
    todayTokensCoverage: accountStats.todayStatsCoverage.tokens,
    todayCostCoverage,
    sevenDayRequests: sevenDay.requests,
    sevenDayTokens: sevenDay.tokens,
    hasTodayUsageData,
    hasSevenDayUsageData: sevenDay.hasData,
    hasUsageData:
      hasTodayUsageData ||
      sevenDay.hasData ||
      Boolean(accountStats.siteDayUsage?.length),
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
