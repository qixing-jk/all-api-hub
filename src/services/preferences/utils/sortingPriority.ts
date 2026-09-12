import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_HEALTH_STATUS,
  DATA_TYPE_INCOME,
} from "~/constants"
import {
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  isAccountTodayMetricAvailable,
  isAccountTodayMetricComplete,
} from "~/services/accounts/accountTodayStats"
import { compareAccountDisplayNames } from "~/services/accounts/utils/accountDisplayName"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/inspection"
import type {
  AccountTodayMetricAvailability,
  ActiveSortField,
  CurrencyType,
  DisplaySiteData,
  SiteAccount,
  SortField,
} from "~/types"
import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"

/**
 * This constant defines the default sorting priority configuration.
 * It contains the data-only configuration for sorting criteria, without UI text.
 */
export const DEFAULT_SORTING_PRIORITY_CONFIG: SortingPriorityConfig = {
  criteria: [
    {
      id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
      enabled: true,
      priority: 0,
    },
    {
      id: SortingCriteriaType.CUSTOM_REDEEM_URL,
      enabled: true,
      priority: 1,
    },
    {
      id: SortingCriteriaType.CURRENT_SITE,
      enabled: true,
      priority: 2,
    },
    {
      id: SortingCriteriaType.MATCHED_OPEN_TABS,
      enabled: true,
      priority: 3,
    },
  ],
  lastModified: Date.now(),
}

/** Criteria that remain user-configurable for automatic account ordering. */
export const CONFIGURABLE_SORTING_CRITERIA = [
  SortingCriteriaType.CUSTOM_CHECK_IN_URL,
  SortingCriteriaType.CUSTOM_REDEEM_URL,
  SortingCriteriaType.CURRENT_SITE,
  SortingCriteriaType.MATCHED_OPEN_TABS,
] as const

const CONFIGURABLE_SORTING_CRITERIA_SET = new Set<SortingCriteriaType>(
  CONFIGURABLE_SORTING_CRITERIA,
)

export type AccountSortGroup = "pinned" | "normal" | "disabled"

/** Resolves the fixed account section before any within-section ordering. */
export function getAccountSortGroup(
  account: DisplaySiteData,
  pinnedAccountIds: ReadonlySet<string>,
): AccountSortGroup {
  if (account.disabled === true) return "disabled"
  if (pinnedAccountIds.has(account.id)) return "pinned"
  return "normal"
}

/**
 * Creates a fresh default sorting priority config snapshot with cloned criteria
 * and a current timestamp.
 */
export function createDefaultSortingPriorityConfig(): SortingPriorityConfig {
  return {
    ...DEFAULT_SORTING_PRIORITY_CONFIG,
    criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => ({ ...c })),
    lastModified: Date.now(),
  }
}

/** Returns whether an account still needs site or custom check-in today. */
function isNotCheckedIn(item: DisplaySiteData): boolean {
  const checkIn = item.checkIn
  const supportsCustomCheckIn =
    typeof checkIn.customCheckIn?.url === "string" &&
    checkIn.customCheckIn.url.trim() !== ""
  const selectedStatus = getSelectedCheckInStatus({
    config: checkIn,
    siteType: item.siteType,
  })
  const siteNotCheckedIn =
    selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
  const customNotCheckedIn =
    supportsCustomCheckIn &&
    (checkIn.customCheckIn?.isCheckedInToday ?? false) === false

  return siteNotCheckedIn || customNotCheckedIn
}

/** Compares health using the established error-to-healthy severity order. */
function compareHealthStatus(a: DisplaySiteData, b: DisplaySiteData): number {
  const healthPriority = { error: 1, warning: 2, unknown: 3, healthy: 4 }
  const healthA = healthPriority[a.health?.status] || 4
  const healthB = healthPriority[b.health?.status] || 4
  return healthA - healthB
}

/** Keeps name ordering deterministic for stale or partially migrated records. */
function compareAccountNames(
  a: DisplaySiteData,
  b: DisplaySiteData,
  sortOrder: "asc" | "desc",
): number {
  if (typeof a.name === "string" && typeof b.name === "string") {
    return compareAccountDisplayNames(a, b, sortOrder)
  }

  const direction = sortOrder === "asc" ? 1 : -1
  const nameComparison = (a.name ?? "").localeCompare(b.name ?? "")
  return (nameComparison || a.id.localeCompare(b.id)) * direction
}

/**
 * Compare two display records using the user-selected sort field.
 * Keeps currency-aware ordering logic in a single place so every criteria can
 * reuse the same implementation.
 * @param a First account entry to compare.
 * @param b Second account entry to compare.
 * @param sortField Field selected by the user for comparison.
 * @param currencyType Currency used when comparing numeric balances.
 * @param sortOrder Sort direction (`asc` or `desc`).
 */
function compareByUserSortField(
  a: DisplaySiteData,
  b: DisplaySiteData,
  sortField: SortField,
  currencyType: CurrencyType,
  sortOrder: "asc" | "desc",
) {
  switch (sortField) {
    case "name":
      return compareAccountNames(a, b, sortOrder)
    case DATA_TYPE_CHECK_IN_REQUIREMENT: {
      const aNotCheckedIn = isNotCheckedIn(a) ? 1 : 0
      const bNotCheckedIn = isNotCheckedIn(b) ? 1 : 0
      return sortOrder === "asc"
        ? aNotCheckedIn - bNotCheckedIn
        : bNotCheckedIn - aNotCheckedIn
    }
    case DATA_TYPE_HEALTH_STATUS: {
      const comparison = compareHealthStatus(a, b)
      return sortOrder === "asc" ? comparison : -comparison
    }
    case DATA_TYPE_BALANCE:
      return sortOrder === "asc"
        ? a.balance[currencyType] - b.balance[currencyType]
        : b.balance[currencyType] - a.balance[currencyType]
    case DATA_TYPE_CONSUMPTION:
      return compareTodayMetric(
        a.todayConsumption[currencyType],
        a.todayStatsAvailability.consumption,
        b.todayConsumption[currencyType],
        b.todayStatsAvailability.consumption,
        sortOrder,
      )
    case DATA_TYPE_INCOME:
      return compareTodayMetric(
        a.todayIncome[currencyType],
        a.todayStatsAvailability.income,
        b.todayIncome[currencyType],
        b.todayStatsAvailability.income,
        sortOrder,
      )
    case DATA_TYPE_CREATED_AT: {
      const aCreatedAt =
        typeof a.created_at === "number" && Number.isFinite(a.created_at)
          ? a.created_at
          : 0
      const bCreatedAt =
        typeof b.created_at === "number" && Number.isFinite(b.created_at)
          ? b.created_at
          : 0
      return sortOrder === "asc"
        ? aCreatedAt - bCreatedAt
        : bCreatedAt - aCreatedAt
    }
    default:
      return 0
  }
}

/**
 * Sorts available today statistics numerically while keeping unavailable
 * compatibility values at the end in either direction.
 */
function compareTodayMetric(
  aValue: number,
  aAvailability: AccountTodayMetricAvailability,
  bValue: number,
  bAvailability: AccountTodayMetricAvailability,
  sortOrder: "asc" | "desc",
): number {
  const aAvailable = isAccountTodayMetricAvailable(aAvailability)
  const bAvailable = isAccountTodayMetricAvailable(bAvailability)

  if (aAvailable !== bAvailable) {
    return aAvailable ? -1 : 1
  }
  if (!aAvailable) {
    return 0
  }

  const numericComparison =
    sortOrder === "asc" ? aValue - bValue : bValue - aValue
  if (numericComparison !== 0) {
    return numericComparison
  }

  const aComplete = isAccountTodayMetricComplete(aAvailability)
  const bComplete = isAccountTodayMetricComplete(bAvailability)
  return aComplete === bComplete ? 0 : aComplete ? -1 : 1
}
/**
 * Applies a specific sorting criteria to two display entries and returns the comparison result.
 * Criteria are evaluated in priority order until one produces a non-zero delta.
 * @param a First display entry for comparison.
 * @param b Second display entry for comparison.
 * @param criteriaId Sorting criteria identifier.
 * @param detectedAccount Account currently detected in browser context.
 * @param matchedAccountScores Map of account IDs to open-tab match scores.
 * @param manualOrderIndices Optional map of manual order positions by account ID.
 */
function applySortingCriteria(
  a: DisplaySiteData,
  b: DisplaySiteData,
  criteriaId: SortingCriteriaType,
  detectedAccount: SiteAccount | null,
  matchedAccountScores: Record<string, number>,
  manualOrderIndices?: Record<string, number>,
): number {
  switch (criteriaId) {
    case SortingCriteriaType.CURRENT_SITE:
      if (a.id === detectedAccount?.id) return -1
      if (b.id === detectedAccount?.id) return 1
      return 0

    case SortingCriteriaType.CUSTOM_CHECK_IN_URL: {
      const customCheckInA = a?.checkIn?.customCheckIn?.url ? 1 : 0
      const customCheckInB = b?.checkIn?.customCheckIn?.url ? 1 : 0
      return customCheckInB - customCheckInA
    }

    case SortingCriteriaType.CUSTOM_REDEEM_URL: {
      const customRedeemA = a?.checkIn?.customCheckIn?.redeemUrl ? 1 : 0
      const customRedeemB = b?.checkIn?.customCheckIn?.redeemUrl ? 1 : 0
      return customRedeemB - customRedeemA
    }

    case SortingCriteriaType.MATCHED_OPEN_TABS: {
      const scoreA = matchedAccountScores[a.id] || 0
      const scoreB = matchedAccountScores[b.id] || 0
      return scoreB - scoreA
    } // Higher score = higher priority

    case SortingCriteriaType.MANUAL_ORDER: {
      const manualIndexA = manualOrderIndices?.[a.id]
      const manualIndexB = manualOrderIndices?.[b.id]
      const hasA = typeof manualIndexA === "number"
      const hasB = typeof manualIndexB === "number"
      if (hasA && hasB) {
        return manualIndexA - manualIndexB
      }
      if (hasA) return -1
      if (hasB) return 1
      return 0
    }

    default:
      return 0
  }
}
/**
 * Creates a dynamic comparator function for sorting site data based on a data-only configuration.
 * @param config Sorting priority configuration containing data-only fields.
 * @param detectedAccount Currently detected site account, used for 'current_site' priority.
 * @param userSortField Field selected by the user for sorting, or null when field sorting is cleared.
 * @param currencyType Currency used for balance/consumption/income comparisons.
 * @param sortOrder Sort order ('asc' or 'desc').
 * @param matchedAccountScores Map of account IDs to matching scores from open tabs.
 * @param pinnedAccountIds The list of pinned account IDs in priority order.
 * @param manualOrderIndices Map of account ID to manual order index (0-based).
 * @returns Comparator function for `Array.prototype.sort()`.
 */
export function createDynamicSortComparator(
  config: SortingPriorityConfig,
  detectedAccount: SiteAccount | null,
  userSortField: ActiveSortField,
  currencyType: CurrencyType,
  sortOrder: "asc" | "desc",
  matchedAccountScores: Record<string, number> = {},
  pinnedAccountIds: string[] = [],
  manualOrderIndices: Record<string, number> = {},
) {
  const enabledAutomaticCriteria = config.criteria
    .filter(
      (criterion) =>
        criterion.enabled &&
        CONFIGURABLE_SORTING_CRITERIA_SET.has(criterion.id),
    )
    .sort((c1, c2) => c1.priority - c2.priority)
  const pinnedAccountIdSet = new Set(pinnedAccountIds)
  const groupRank: Record<AccountSortGroup, number> = {
    pinned: 0,
    normal: 1,
    disabled: 2,
  }

  return (a: DisplaySiteData, b: DisplaySiteData): number => {
    const groupComparison =
      groupRank[getAccountSortGroup(a, pinnedAccountIdSet)] -
      groupRank[getAccountSortGroup(b, pinnedAccountIdSet)]
    if (groupComparison !== 0) return groupComparison

    if (userSortField !== null) {
      const userComparison = compareByUserSortField(
        a,
        b,
        userSortField,
        currencyType,
        sortOrder,
      )
      if (userComparison !== 0) return userComparison
    } else {
      for (const criteria of enabledAutomaticCriteria) {
        const comparison = applySortingCriteria(
          a,
          b,
          criteria.id,
          detectedAccount,
          matchedAccountScores,
          manualOrderIndices,
        )
        if (comparison !== 0) return comparison
      }
    }

    const manualComparison = applySortingCriteria(
      a,
      b,
      SortingCriteriaType.MANUAL_ORDER,
      detectedAccount,
      matchedAccountScores,
      manualOrderIndices,
    )
    if (manualComparison !== 0) return manualComparison

    return compareAccountNames(a, b, "asc")
  }
}
