import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_CUSTOM_CHECK_IN_URL,
  DATA_TYPE_CUSTOM_REDEEM_URL,
  DATA_TYPE_HEALTH_STATUS,
  DATA_TYPE_INCOME,
  DATA_TYPE_NAME,
} from "~/constants"
import {
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { CURRENCIES } from "~/constants/money"
import { projectAllowancePosition } from "~/services/accounts/allowances"
import { getSiteDayReadings } from "~/services/accounts/metrics/accountTodayStats"
import { getDisplayBalancePositions } from "~/services/accounts/metrics/balanceProjection"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
  selectDisplayCashflow,
} from "~/services/accounts/metrics/consumptionProjection"
import { compareAccountDisplayNames } from "~/services/accounts/utils/accountDisplayName"
import { assetIdentity } from "~/services/amounts/assets"
import {
  isKnownOrStaleObservation,
  type Amount,
} from "~/services/amounts/balance"
import { compareDecimalProducts } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
} from "~/services/amounts/financialConstants"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/discovery/inspection"
import { isCheckInMethodStatusCurrent } from "~/services/checkin/autoCheckin/domain"
import { getDisplayCurrency } from "~/services/preferences/currencyDisplay"
import type {
  ActiveSortField,
  CurrencyDisplay,
  CurrencyType,
  DisplaySiteData,
  SiteAccount,
  SortField,
  SortOrder,
} from "~/types"
import { SiteHealthStatus } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"
import { convertUsdToCny } from "~/utils/core/money"

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

export const ACCOUNT_SORT_GROUPS = {
  Pinned: "pinned",
  Normal: "normal",
  Disabled: "disabled",
} as const
export type AccountSortGroup =
  (typeof ACCOUNT_SORT_GROUPS)[keyof typeof ACCOUNT_SORT_GROUPS]

export const ACCOUNT_CONTEXT_BOOSTS = {
  CurrentSite: "current-site",
  ActiveTab: "active-tab",
  OpenTabs: "open-tabs",
} as const
export type AccountContextBoost =
  (typeof ACCOUNT_CONTEXT_BOOSTS)[keyof typeof ACCOUNT_CONTEXT_BOOSTS]

/**
 * Strength of a related-page match found among open tabs. The tab the user is
 * viewing outranks related pages that only stay open in the background.
 */
export const OPEN_TAB_MATCH_TIER = {
  /** A related page is open in a tab the user is not viewing. */
  BACKGROUND: 1,
  /** A related page is open in the tab the user is viewing. */
  ACTIVE: 2,
} as const

export type OpenTabMatchTier =
  (typeof OPEN_TAB_MATCH_TIER)[keyof typeof OPEN_TAB_MATCH_TIER]

/** Account id to the strongest related-page tier found among its open tabs. */
export type OpenTabMatchTiers = Record<string, OpenTabMatchTier>

/** Browsing-context tiers in display order; each tier splits into pinned then normal. */
const CONTEXT_BOOST_RANKS: Record<AccountContextBoost | "none", number> = {
  [ACCOUNT_CONTEXT_BOOSTS.CurrentSite]: 0,
  [ACCOUNT_CONTEXT_BOOSTS.ActiveTab]: 1,
  [ACCOUNT_CONTEXT_BOOSTS.OpenTabs]: 2,
  none: 3,
}

/** Display groups inside one context tier: pinned accounts, then normal accounts. */
const CONTEXT_TIER_GROUPS = 2

/** Keeps disabled accounts behind every context tier and its display groups. */
const DISABLED_ACCOUNT_PRIORITY =
  Object.keys(CONTEXT_BOOST_RANKS).length * CONTEXT_TIER_GROUPS

/** Shares the enabled browsing-context tiers between ordering and its UI hints. */
export function createAccountContextBoostResolver(
  config: SortingPriorityConfig,
  detectedAccountId: string | undefined,
  matchedTabTiers: OpenTabMatchTiers,
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
      return ACCOUNT_CONTEXT_BOOSTS.CurrentSite
    if (!enabled.has(SortingCriteriaType.MATCHED_OPEN_TABS)) return undefined
    const tier = matchedTabTiers[accountId]
    if (tier === OPEN_TAB_MATCH_TIER.ACTIVE)
      return ACCOUNT_CONTEXT_BOOSTS.ActiveTab
    if (tier === OPEN_TAB_MATCH_TIER.BACKGROUND)
      return ACCOUNT_CONTEXT_BOOSTS.OpenTabs
    return undefined
  }
}

/** Resolves the fixed account section before any within-section ordering. */
export function getAccountSortGroup(
  account: DisplaySiteData,
  pinnedAccountIds: ReadonlySet<string>,
): AccountSortGroup {
  if (account.disabled === true) return ACCOUNT_SORT_GROUPS.Disabled
  if (pinnedAccountIds.has(account.id)) return ACCOUNT_SORT_GROUPS.Pinned
  return ACCOUNT_SORT_GROUPS.Normal
}

/** Shared display tiers: browsing context before pins, with disabled accounts last. */
export function getAccountDisplayPriority(
  account: DisplaySiteData,
  pinnedAccountIds: ReadonlySet<string>,
  boost?: AccountContextBoost,
): number {
  const group = getAccountSortGroup(account, pinnedAccountIds)
  if (group === ACCOUNT_SORT_GROUPS.Disabled) return DISABLED_ACCOUNT_PRIORITY
  return (
    CONTEXT_BOOST_RANKS[boost ?? "none"] * CONTEXT_TIER_GROUPS +
    (group === ACCOUNT_SORT_GROUPS.Pinned ? 0 : 1)
  )
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
  const methodId = resolveSelectedCheckInMethod({
    config: checkIn,
    siteType: item.siteType,
    siteUrl: item.baseUrl,
  })
  const selectedStatus = methodId
    ? checkIn.methodKnowledge.methods[methodId]?.status
    : undefined
  const siteNotCheckedIn =
    methodId !== null &&
    selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked &&
    isCheckInMethodStatusCurrent(methodId, selectedStatus)
  const customNotCheckedIn =
    supportsCustomCheckIn &&
    (checkIn.customCheckIn?.isCheckedInToday ?? false) === false

  return siteNotCheckedIn || customNotCheckedIn
}

/** Severity order used when sorting by health, from most to least urgent. */
const HEALTH_STATUS_RANK: Record<SiteHealthStatus, number> = {
  [SiteHealthStatus.Error]: 1,
  [SiteHealthStatus.Warning]: 2,
  [SiteHealthStatus.Unknown]: 3,
  [SiteHealthStatus.Healthy]: 4,
}

/** Missing or unexpected statuses rank as unknown so comparisons stay total. */
function getHealthRank(status: SiteHealthStatus | undefined): number {
  const rank: number | undefined =
    HEALTH_STATUS_RANK[status ?? SiteHealthStatus.Unknown]
  return rank ?? HEALTH_STATUS_RANK[SiteHealthStatus.Unknown]
}

/** Compares health using the established error-to-healthy severity order. */
function compareHealthStatus(a: DisplaySiteData, b: DisplaySiteData): number {
  return getHealthRank(a.health?.status) - getHealthRank(b.health?.status)
}

/** Ascending comparisons keep their natural order; descending comparisons invert them. */
function applySortDirection(value: number, sortOrder: SortOrder): number {
  return sortOrder === "asc" ? value : -value
}

/** Keeps name ordering deterministic for stale or partially migrated records. */
function compareAccountNames(
  a: DisplaySiteData,
  b: DisplaySiteData,
  sortOrder: SortOrder,
): number {
  if (typeof a.name === "string" && typeof b.name === "string") {
    return compareAccountDisplayNames(a, b, sortOrder)
  }

  const nameComparison = (a.name ?? "").localeCompare(b.name ?? "")
  return applySortDirection(
    nameComparison || a.id.localeCompare(b.id),
    sortOrder,
  )
}

/** The row's primary amount defines ordering independently of subtotal eligibility. */
function getBalanceSortValue(account: DisplaySiteData) {
  const snapshot = account.manualBalanceSnapshot ?? account.balanceSnapshot
  const displayed = getDisplayBalancePositions(snapshot)
  let primary = displayed[0]
  if (
    (!primary ||
      primary.asset.kind === ASSET_KINDS.Unknown ||
      !isKnownOrStaleObservation(primary.amount)) &&
    account.allowances?.entries[0]
  )
    primary = projectAllowancePosition(account.allowances.entries[0])
  return primary &&
    primary.asset.kind !== ASSET_KINDS.Unknown &&
    isKnownOrStaleObservation(primary.amount)
    ? {
        amount: {
          asset: primary.asset,
          value: primary.amount.value,
        } satisfies Amount,
        allowance: primary.role === BALANCE_ROLES.Allowance,
      }
    : undefined
}

/** Compare dollars using the same per-account conversion used for display. */
function amountForSort(
  amount: Amount,
  account: DisplaySiteData,
  currencyType: CurrencyType,
): Amount {
  if (
    currencyType !== CURRENCIES.CNY ||
    amount.asset.kind !== ASSET_KINDS.Currency ||
    amount.asset.code !== CURRENCIES.USD
  )
    return amount
  try {
    return {
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: convertUsdToCny(amount.value, account.exchangeRate),
    }
  } catch {
    return amount
  }
}

/** Compare USD and CNY at each account's configured rate without rounding a division. */
function compareFinancialAmounts(
  firstAmount: Amount,
  firstAccount: DisplaySiteData,
  secondAmount: Amount,
  secondAccount: DisplaySiteData,
  currencyType: CurrencyType,
  sortOrder: SortOrder,
): number {
  const comparable = (amount: Amount, account: DisplaySiteData) => {
    const displayed = amountForSort(amount, account, currencyType)
    if (
      currencyType === CURRENCIES.USD &&
      displayed.asset.kind === ASSET_KINDS.Currency &&
      displayed.asset.code === CURRENCIES.CNY
    ) {
      try {
        return {
          assetKey: assetIdentity({
            kind: ASSET_KINDS.Currency,
            code: CURRENCIES.USD,
          }),
          numerator: displayed.value,
          denominator: convertUsdToCny("1", account.exchangeRate),
        }
      } catch {
        // Without a usable rate, keep the original currency's comparison group.
      }
    }
    return {
      assetKey: assetIdentity(displayed.asset),
      numerator: displayed.value,
      denominator: "1",
    }
  }
  const first = comparable(firstAmount, firstAccount)
  const second = comparable(secondAmount, secondAccount)
  if (first.assetKey !== second.assetKey)
    return first.assetKey < second.assetKey ? -1 : 1
  return applySortDirection(
    compareDecimalProducts(
      [first.numerator, second.denominator],
      [second.numerator, first.denominator],
    ),
    sortOrder,
  )
}

/** Wallets and plans retain their groups; comparable monetary values share an order. */
function compareBalances(
  a: DisplaySiteData,
  b: DisplaySiteData,
  currencyType: CurrencyType,
  sortOrder: SortOrder,
): number {
  const aValue = getBalanceSortValue(a)
  const bValue = getBalanceSortValue(b)
  if (!aValue || !bValue) return aValue ? -1 : bValue ? 1 : 0
  if (aValue.allowance !== bValue.allowance) return aValue.allowance ? 1 : -1
  return compareFinancialAmounts(
    aValue.amount,
    a,
    bValue.amount,
    b,
    currencyType,
    sortOrder,
  )
}

/**
 * Compare two display records using the user-selected sort field.
 * USD and CNY share a converted monetary order; other asset groups remain separate.
 * @param a First account entry to compare.
 * @param b Second account entry to compare.
 * @param sortField Field selected by the user for comparison.
 * @param currencyType Display currency for comparable monetary amounts.
 * @param sortOrder Sort direction (`asc` or `desc`).
 */
function compareByUserSortField(
  a: DisplaySiteData,
  b: DisplaySiteData,
  sortField: SortField,
  currencyType: CurrencyType,
  sortOrder: SortOrder,
) {
  switch (sortField) {
    case DATA_TYPE_NAME:
      return compareAccountNames(a, b, sortOrder)
    case DATA_TYPE_CHECK_IN_REQUIREMENT: {
      const aNotCheckedIn = isNotCheckedIn(a) ? 1 : 0
      const bNotCheckedIn = isNotCheckedIn(b) ? 1 : 0
      return applySortDirection(aNotCheckedIn - bNotCheckedIn, sortOrder)
    }
    case DATA_TYPE_CUSTOM_CHECK_IN_URL:
    case DATA_TYPE_CUSTOM_REDEEM_URL: {
      const key =
        sortField === DATA_TYPE_CUSTOM_CHECK_IN_URL ? "url" : "redeemUrl"
      const hasLink = (item: DisplaySiteData) =>
        item.checkIn?.customCheckIn?.[key]?.trim() ? 1 : 0
      return applySortDirection(hasLink(a) - hasLink(b), sortOrder)
    }
    case DATA_TYPE_HEALTH_STATUS:
      return applySortDirection(compareHealthStatus(a, b), sortOrder)
    case DATA_TYPE_BALANCE: {
      return compareBalances(a, b, currencyType, sortOrder)
    }
    case DATA_TYPE_CREATED_AT: {
      const aCreatedAt =
        typeof a.created_at === "number" && Number.isFinite(a.created_at)
          ? a.created_at
          : 0
      const bCreatedAt =
        typeof b.created_at === "number" && Number.isFinite(b.created_at)
          ? b.created_at
          : 0
      return applySortDirection(aCreatedAt - bCreatedAt, sortOrder)
    }
    default:
      return 0
  }
}

/**
 * Orders displayed local-day and provider-day readings in their own asset groups;
 * retained values follow current readings and missing values stay last.
 */
function createNativePeriodComparator(
  currencyType: CurrencyType,
  sortOrder: SortOrder,
  project:
    typeof getDisplayConsumptionProjection | typeof getDisplayIncomeProjection,
  currencyDisplay: CurrencyDisplay,
) {
  const asOf = Date.now()
  const value = (account: DisplaySiteData) => {
    const individualAccount: DisplaySiteData = {
      ...account,
      disabled: false,
      excludeFromTodayIncome: false,
    }
    const projection = project([individualAccount], asOf)
    const displayed = selectDisplayCashflow(
      projection,
      getDisplayCurrency(currencyDisplay, currencyType),
      account.exchangeRate,
    )
    const nativeAmount =
      displayed.comparisonAmount ??
      displayed.nativeAmount ??
      displayed.displayAmount ??
      (displayed.coverage.status !== ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
        ? ({
            asset: { kind: ASSET_KINDS.Currency, code: displayed.currency },
            value: String(displayed.value),
          } satisfies Amount)
        : undefined)
    if (nativeAmount) {
      return {
        siteDay: false,
        lastKnown: false,
        amount: nativeAmount,
      }
    }
    const reference = projection.references?.[0]
    if (!reference) {
      if (project !== getDisplayConsumptionProjection) return undefined
      const reading = getSiteDayReadings(account, asOf)[0]
      const cost = reading?.usage.cost
      return reading &&
        cost &&
        cost.asset.kind !== ASSET_KINDS.Unknown &&
        isKnownOrStaleObservation(cost.amount)
        ? {
            siteDay: true,
            lastKnown: reading.lastKnown,
            amount: {
              asset: cost.asset,
              value: cost.amount.value,
            } satisfies Amount,
          }
        : undefined
    }
    const amount: Amount = {
      asset: { kind: ASSET_KINDS.Currency, code: currencyType },
      value: String(reference.amount[currencyType]),
    }
    return {
      siteDay: false,
      lastKnown: reference.lastKnown,
      amount,
    }
  }
  const values = new WeakMap<DisplaySiteData, ReturnType<typeof value>>()
  const getValue = (account: DisplaySiteData) => {
    if (!values.has(account)) values.set(account, value(account))
    return values.get(account)
  }
  return (a: DisplaySiteData, b: DisplaySiteData) => {
    const first = getValue(a)
    const second = getValue(b)
    if (!first || !second) return first ? -1 : second ? 1 : 0
    if (first.lastKnown !== second.lastKnown) return first.lastKnown ? 1 : -1
    if (first.siteDay !== second.siteDay) return first.siteDay ? 1 : -1
    return compareFinancialAmounts(
      first.amount,
      a,
      second.amount,
      b,
      currencyType,
      sortOrder,
    )
  }
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
 * @param matchedTabTiers Map of account IDs to the strongest related-page tier found among open tabs.
 * @param pinnedAccountIds The list of pinned account IDs in priority order.
 * @param manualOrderIndices Map of account ID to manual order index (0-based).
 * @returns Comparator function for `Array.prototype.sort()`.
 */
export function createDynamicSortComparator(
  config: SortingPriorityConfig,
  detectedAccount: SiteAccount | null,
  userSortField: ActiveSortField,
  currencyType: CurrencyType,
  sortOrder: SortOrder,
  matchedTabTiers: OpenTabMatchTiers = {},
  pinnedAccountIds: string[] = [],
  manualOrderIndices: Record<string, number> = {},
  currencyDisplay: CurrencyDisplay = currencyType,
) {
  const comparisonCurrency =
    getDisplayCurrency(currencyDisplay, currencyType) ?? CURRENCIES.USD
  const projectCashflow =
    userSortField === DATA_TYPE_CONSUMPTION
      ? getDisplayConsumptionProjection
      : userSortField === DATA_TYPE_INCOME
        ? getDisplayIncomeProjection
        : undefined
  const compareCashflow =
    projectCashflow &&
    createNativePeriodComparator(
      comparisonCurrency,
      sortOrder,
      projectCashflow,
      currencyDisplay,
    )
  const pinnedAccountIdSet = new Set(pinnedAccountIds)
  const getContextBoost = createAccountContextBoostResolver(
    config,
    detectedAccount?.id,
    matchedTabTiers,
  )
  return (a: DisplaySiteData, b: DisplaySiteData): number => {
    const priorityComparison =
      getAccountDisplayPriority(a, pinnedAccountIdSet, getContextBoost(a.id)) -
      getAccountDisplayPriority(b, pinnedAccountIdSet, getContextBoost(b.id))
    if (priorityComparison !== 0) return priorityComparison

    if (userSortField !== null) {
      const userComparison = compareCashflow
        ? compareCashflow(a, b)
        : compareByUserSortField(
            a,
            b,
            userSortField,
            comparisonCurrency,
            sortOrder,
          )
      if (userComparison !== 0) return userComparison
    }

    const manualComparison = compareManualOrder(a, b, manualOrderIndices)
    if (manualComparison !== 0) return manualComparison

    return compareAccountNames(a, b, "asc")
  }
}
