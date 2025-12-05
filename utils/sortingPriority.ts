import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import type {
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
      id: SortingCriteriaType.PINNED,
      enabled: true,
      priority: 0,
    },
    {
      id: SortingCriteriaType.MANUAL_ORDER,
      enabled: true,
      priority: 1,
    },
    {
      id: SortingCriteriaType.CURRENT_SITE,
      enabled: true,
      priority: 2,
    },
    {
      id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
      enabled: true,
      priority: 3,
    },
    {
      id: SortingCriteriaType.MATCHED_OPEN_TABS,
      enabled: true,
      priority: 4,
    },
    {
      id: SortingCriteriaType.HEALTH_STATUS,
      enabled: true,
      priority: 5,
    },
    {
      id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
      enabled: true,
      priority: 6,
    },
    {
      id: SortingCriteriaType.CUSTOM_REDEEM_URL,
      enabled: true,
      priority: 7,
    },
    {
      id: SortingCriteriaType.USER_SORT_FIELD,
      enabled: true,
      priority: 8,
    },
  ],
  lastModified: Date.now(),
}

function compareByUserSortField(
  a: DisplaySiteData,
  b: DisplaySiteData,
  sortField: SortField,
  currencyType: CurrencyType,
  sortOrder: "asc" | "desc",
) {
  switch (sortField) {
    case "name":
      return sortOrder === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    case DATA_TYPE_BALANCE:
      return sortOrder === "asc"
        ? a.balance[currencyType] - b.balance[currencyType]
        : b.balance[currencyType] - a.balance[currencyType]
    case DATA_TYPE_CONSUMPTION:
      return sortOrder === "asc"
        ? a.todayConsumption[currencyType] - b.todayConsumption[currencyType]
        : b.todayConsumption[currencyType] - a.todayConsumption[currencyType]
    default:
      return 0
  }
}
function applySortingCriteria(
  a: DisplaySiteData,
  b: DisplaySiteData,
  criteriaId: SortingCriteriaType,
  detectedAccount: SiteAccount | null,
  userSortField: SortField,
  currencyType: CurrencyType,
  sortOrder: "asc" | "desc",
  matchedAccountScores: Record<string, number>,
  pinnedAccountIds: string[],
  manualOrderIndices?: Record<string, number>,
): number {
  switch (criteriaId) {
    case SortingCriteriaType.PINNED: {
      const indexA = pinnedAccountIds.indexOf(a.id)
      const indexB = pinnedAccountIds.indexOf(b.id)
      const isPinnedA = indexA !== -1
      const isPinnedB = indexB !== -1

      if (isPinnedA && isPinnedB) {
        return indexA - indexB
      }
      if (isPinnedA) return -1
      if (isPinnedB) return 1
      return 0
    }

    case SortingCriteriaType.CURRENT_SITE:
      if (a.id === detectedAccount?.id) return -1
      if (b.id === detectedAccount?.id) return 1
      return 0

    case SortingCriteriaType.HEALTH_STATUS: {
      const healthPriority = { error: 1, warning: 2, unknown: 3, healthy: 4 }
      const healthA = healthPriority[a.health?.status] || 4
      const healthB = healthPriority[b.health?.status] || 4
      return healthA - healthB
    }

    case SortingCriteriaType.CHECK_IN_REQUIREMENT: {
      function isNotCheckedIn(item: any): boolean {
        const checkIn = item?.checkIn
        if (!checkIn) return false

        const supportsCheckIn =
          checkIn.enableDetection === true ||
          (typeof checkIn.customCheckInUrl === "string" &&
            checkIn.customCheckInUrl.trim() !== "")

        // 只在支持签到且未签到的情况下返回 true
        return supportsCheckIn && checkIn.isCheckedInToday === false
      }

      const aNotCheckedIn = isNotCheckedIn(a) ? 1 : 0
      const bNotCheckedIn = isNotCheckedIn(b) ? 1 : 0

      // 未签到的排前面
      return bNotCheckedIn - aNotCheckedIn
    }

    case SortingCriteriaType.CUSTOM_CHECK_IN_URL: {
      const customCheckInA = a?.checkIn?.customCheckInUrl ? 1 : 0
      const customCheckInB = b?.checkIn?.customCheckInUrl ? 1 : 0
      return customCheckInB - customCheckInA
    }

    case SortingCriteriaType.CUSTOM_REDEEM_URL: {
      const customRedeemA = a?.checkIn?.customRedeemUrl ? 1 : 0
      const customRedeemB = b?.checkIn?.customRedeemUrl ? 1 : 0
      return customRedeemB - customRedeemA
    }

    case SortingCriteriaType.MATCHED_OPEN_TABS: {
      const scoreA = matchedAccountScores[a.id] || 0
      const scoreB = matchedAccountScores[b.id] || 0
      return scoreB - scoreA
    } // Higher score = higher priority

    case SortingCriteriaType.USER_SORT_FIELD:
      return compareByUserSortField(
        a,
        b,
        userSortField,
        currencyType,
        sortOrder,
      )

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
 *
 * @param config The sorting priority configuration containing data-only fields.
 * @param detectedAccount The currently detected site account, used for 'current_site' priority.
 * @param userSortField The field selected by the user for sorting ('name', 'balance', 'consumption').
 * @param currencyType The currency type to use for sorting balance or consumption.
 * @param sortOrder The sort order ('asc' or 'desc').
 * @param matchedAccountScores
 * @param pinnedAccountIds The list of pinned account IDs in order
 * @param manualOrderIndices Map of account id to manual order index (0-based)
 * @returns A comparator function for `Array.prototype.sort()`.
 */
export function createDynamicSortComparator(
  config: SortingPriorityConfig,
  detectedAccount: SiteAccount | null,
  userSortField: SortField,
  currencyType: CurrencyType,
  sortOrder: "asc" | "desc",
  matchedAccountScores: Record<string, number> = {},
  pinnedAccountIds: string[] = [],
  manualOrderIndices: Record<string, number> = {},
) {
  return (a: DisplaySiteData, b: DisplaySiteData): number => {
    const enabledCriteria = config.criteria
      .filter((c) => c.enabled)
      .sort((c1, c2) => c1.priority - c2.priority)

    for (const criteria of enabledCriteria) {
      const comparison = applySortingCriteria(
        a,
        b,
        criteria.id,
        detectedAccount,
        userSortField,
        currencyType,
        sortOrder,
        matchedAccountScores,
        pinnedAccountIds,
        manualOrderIndices,
      )
      if (comparison !== 0) return comparison
    }
    return 0
  }
}
