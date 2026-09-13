import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_CUSTOM_CHECK_IN_URL,
  DATA_TYPE_CUSTOM_REDEEM_URL,
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
      id: SortingCriteriaType.CURRENT_SITE,
      enabled: true,
      priority: 0,
    },
    {
      id: SortingCriteriaType.MATCHED_OPEN_TABS,
      enabled: true,
      priority: 1,
    },
  ],
  lastModified: Date.now(),
}

/** Persisted browsing-context rules; retain IDs and enabled choices across upgrades. */
export const CONFIGURABLE_SORTING_CRITERIA = [
  SortingCriteriaType.CURRENT_SITE,
  SortingCriteriaType.MATCHED_OPEN_TABS,
] as const

export type AccountSortGroup = "pinned" | "normal" | "disabled"

export type AccountContextBoost = "current-site" | "open-tabs"

/** Shares the enabled browsing-context tiers between ordering and its UI hints. */
export function createAccountContextBoostResolver(
  config: SortingPriorityConfig,
  detectedAccountId: string | undefined,
  matchedAccountScores: Record<string, number>,
): (accountId: string) => AccountContextBoost | undefined {
  const enabled = new Set(
    config.criteria
      .filter((criterion) => criterion.enabled)
      .map(({ id }) => id),
  )
  return (accountId) => {
    if (
      enabled.has(SortingCriteriaType.CURRENT_SITE) &&
      accountId === detectedAccountId
    )
      return "current-site"
    if (
      enabled.has(SortingCriteriaType.MATCHED_OPEN_TABS) &&
      matchedAccountScores[accountId] > 0
    )
      return "open-tabs"
    return undefined
  }
}

/** Resolves the fixed account section before any within-section ordering. */
export function getAccountSortGroup(
  account: DisplaySiteData,
  pinnedAccountIds: ReadonlySet<string>,
): AccountSortGroup {
  if (account.disabled === true) return "disabled"
  if (pinnedAccountIds.has(account.id)) return "pinned"
  return "normal"
}

/** Shared display tiers: browsing context before pins, with disabled accounts last. */
export function getAccountDisplayPriority(
  account: DisplaySiteData,
  pinnedAccountIds: ReadonlySet<string>,
  boost?: AccountContextBoost,
): number {
  const group = getAccountSortGroup(account, pinnedAccountIds)
  if (group === "disabled") return 6
  const contextRank =
    boost === "current-site" ? 0 : boost === "open-tabs" ? 1 : 2
  return contextRank * 2 + (group === "pinned" ? 0 : 1)
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
    case DATA_TYPE_CUSTOM_CHECK_IN_URL:
    case DATA_TYPE_CUSTOM_REDEEM_URL: {
      const key =
        sortField === DATA_TYPE_CUSTOM_CHECK_IN_URL ? "url" : "redeemUrl"
      const hasLink = (item: DisplaySiteData) =>
        item.checkIn?.customCheckIn?.[key]?.trim() ? 1 : 0
      const comparison = hasLink(a) - hasLink(b)
      return sortOrder === "asc" ? comparison : -comparison
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
/** Compares saved manual positions, leaving unlisted accounts after listed ones. */
function compareManualOrder(
  a: DisplaySiteData,
  b: DisplaySiteData,
  manualOrderIndices: Record<string, number>,
): number {
  const manualIndexA = manualOrderIndices[a.id]
  const manualIndexB = manualOrderIndices[b.id]
  const hasA = typeof manualIndexA === "number"
  const hasB = typeof manualIndexB === "number"
  if (hasA && hasB) return manualIndexA - manualIndexB
  if (hasA) return -1
  if (hasB) return 1
  return 0
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
  const pinnedAccountIdSet = new Set(pinnedAccountIds)
  const getContextBoost = createAccountContextBoostResolver(
    config,
    detectedAccount?.id,
    matchedAccountScores,
  )
  return (a: DisplaySiteData, b: DisplaySiteData): number => {
    const priorityComparison =
      getAccountDisplayPriority(a, pinnedAccountIdSet, getContextBoost(a.id)) -
      getAccountDisplayPriority(b, pinnedAccountIdSet, getContextBoost(b.id))
    if (priorityComparison !== 0) return priorityComparison

    if (userSortField !== null) {
      const userComparison = compareByUserSortField(
        a,
        b,
        userSortField,
        currencyType,
        sortOrder,
      )
      if (userComparison !== 0) return userComparison
    }

    const manualComparison = compareManualOrder(a, b, manualOrderIndices)
    if (manualComparison !== 0) return manualComparison

    return compareAccountNames(a, b, "asc")
  }
}
