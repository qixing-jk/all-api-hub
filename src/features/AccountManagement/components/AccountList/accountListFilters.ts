import type { DisplaySiteData } from "~/types"

import type { AccountListResultItem } from "./accountListOrdering"
import {
  getAccountCheckInFilterValue,
  type AccountCheckInFilterValue,
} from "./checkInFilter"

export type AccountDisabledFilterValue = "enabled" | "disabled"
export type AccountRefreshFilterValue =
  | "never-synced"
  | "healthy"
  | "warning"
  | "error"
  | "unknown"

export interface AccountListFilterState {
  disabledFilter: AccountDisabledFilterValue | null
  siteTypeFilter: string | null
  refreshStatusFilter: AccountRefreshFilterValue | null
  checkInFilter: AccountCheckInFilterValue | null
  selectedTagIds: string[]
}

interface AccountListFilterAggregation {
  displayedResults: AccountListResultItem[]
  disabledCounts: {
    enabled: number
    disabled: number
    total: number
  }
  siteTypeCounts: Map<string, number>
  refreshCounts: Map<AccountRefreshFilterValue, number>
  checkInCounts: Map<AccountCheckInFilterValue, number>
}

export const ACCOUNT_REFRESH_FILTER_OPTION_ORDER: AccountRefreshFilterValue[] =
  ["never-synced", "healthy", "warning", "error", "unknown"]

const ACCOUNT_REFRESH_FILTER_OPTION_VALUE_SET =
  new Set<AccountRefreshFilterValue>(ACCOUNT_REFRESH_FILTER_OPTION_ORDER)

/**
 * Guards runtime values coming back from Select so only known refresh buckets
 * flow into AccountRefreshFilterValue state.
 */
export function isAccountRefreshFilterValue(
  value: string,
): value is AccountRefreshFilterValue {
  return ACCOUNT_REFRESH_FILTER_OPTION_VALUE_SET.has(
    value as AccountRefreshFilterValue,
  )
}

/**
 * Maps persisted account sync metadata to a user-facing refresh-state filter bucket.
 */
function getAccountRefreshFilterValue(
  account: DisplaySiteData,
): AccountRefreshFilterValue {
  const hasSynced =
    typeof account.last_sync_time === "number" &&
    Number.isFinite(account.last_sync_time) &&
    account.last_sync_time > 0

  if (!hasSynced) {
    return "never-synced"
  }

  switch (account.health.status) {
    case "healthy":
      return "healthy"
    case "warning":
      return "warning"
    case "error":
      return "error"
    case "unknown":
    default:
      return "unknown"
  }
}

/**
 * Aggregates displayed results and per-filter faceted counts in one pass.
 */
export function aggregateAccountListFilters(
  results: AccountListResultItem[],
  filters: AccountListFilterState,
): AccountListFilterAggregation {
  const aggregation: AccountListFilterAggregation = {
    displayedResults: [],
    disabledCounts: {
      enabled: 0,
      disabled: 0,
      total: 0,
    },
    siteTypeCounts: new Map<string, number>(),
    refreshCounts: new Map<AccountRefreshFilterValue, number>(),
    checkInCounts: new Map<AccountCheckInFilterValue, number>(),
  }

  for (const result of results) {
    const { account } = result
    const refreshValue = getAccountRefreshFilterValue(account)
    const checkInValue = getAccountCheckInFilterValue(account)
    const accountTagIds = account.tagIds || []
    const matchesDisabled =
      filters.disabledFilter === null
        ? true
        : filters.disabledFilter === "disabled"
          ? account.disabled === true
          : account.disabled !== true
    const matchesSiteType =
      filters.siteTypeFilter === null
        ? true
        : account.siteType === filters.siteTypeFilter
    const matchesRefresh =
      filters.refreshStatusFilter === null
        ? true
        : refreshValue === filters.refreshStatusFilter
    const matchesCheckIn =
      filters.checkInFilter === null
        ? true
        : checkInValue === filters.checkInFilter
    const matchesTags =
      filters.selectedTagIds.length === 0
        ? true
        : filters.selectedTagIds.some((tagId) => accountTagIds.includes(tagId))

    if (matchesSiteType && matchesRefresh && matchesCheckIn && matchesTags) {
      aggregation.disabledCounts.total += 1
      if (account.disabled === true) {
        aggregation.disabledCounts.disabled += 1
      } else {
        aggregation.disabledCounts.enabled += 1
      }
    }

    if (matchesDisabled && matchesRefresh && matchesCheckIn && matchesTags) {
      aggregation.siteTypeCounts.set(
        account.siteType,
        (aggregation.siteTypeCounts.get(account.siteType) ?? 0) + 1,
      )
    }

    if (matchesDisabled && matchesSiteType && matchesCheckIn && matchesTags) {
      aggregation.refreshCounts.set(
        refreshValue,
        (aggregation.refreshCounts.get(refreshValue) ?? 0) + 1,
      )
    }

    if (matchesDisabled && matchesSiteType && matchesRefresh && matchesTags) {
      aggregation.checkInCounts.set(
        checkInValue,
        (aggregation.checkInCounts.get(checkInValue) ?? 0) + 1,
      )
    }

    if (
      matchesDisabled &&
      matchesSiteType &&
      matchesRefresh &&
      matchesCheckIn &&
      matchesTags
    ) {
      aggregation.displayedResults.push(result)
    }
  }

  return aggregation
}
