import type { SearchResultWithHighlight } from "~/features/AccountManagement/hooks/useAccountSearch"
import {
  getAccountDisplayPriority,
  getAccountSortGroup,
  type AccountContextBoost,
  type AccountSortGroup,
} from "~/services/preferences/utils/sortingPriority"
import type { DisplaySiteData } from "~/types"

export type AccountListResultItem = {
  account: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
}

export type AccountListDisplayItem = {
  result: AccountListResultItem
  group: AccountSortGroup
  isLastInGroup: boolean
  startsNewGroup: boolean
}

/**
 * Moves an account id within the manual ordering array.
 */
export function moveAccountId(
  ids: string[],
  fromIndex: number,
  toIndex: number,
) {
  const nextIds = ids.slice()
  const [movedId] = nextIds.splice(fromIndex, 1)
  if (movedId === undefined) return nextIds
  nextIds.splice(toIndex, 0, movedId)
  return nextIds
}

/** Projects current account records through a session-owned ID order. */
export function projectAccountsByIdOrder(
  accounts: DisplaySiteData[],
  orderedIds: string[],
) {
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const projectedAccounts = orderedIds.flatMap((id) => {
    const account = accountById.get(id)
    if (!account) return []
    accountById.delete(id)
    return [account]
  })

  return [...projectedAccounts, ...accountById.values()]
}

/** Replaces only visible slots while retaining filtered-out account positions. */
export function replaceVisibleAccountOrder(
  allIds: string[],
  nextVisibleIds: string[],
) {
  const visibleIdSet = new Set(nextVisibleIds)
  let visibleIndex = 0

  return allIds.map((id) => {
    if (!visibleIdSet.has(id)) return id
    const nextId = nextVisibleIds[visibleIndex++]
    return nextId ?? id
  })
}

/** Groups rows by display priority while retaining input order within each tier. */
export function groupAccountListResults(
  results: AccountListResultItem[],
  pinnedAccountIdSet: ReadonlySet<string>,
  getContextBoost?: (accountId: string) => AccountContextBoost | undefined,
): AccountListDisplayItem[] {
  const resultsByPriority = new Map<number, AccountListResultItem[]>()
  for (const result of results) {
    const priority = getAccountDisplayPriority(
      result.account,
      pinnedAccountIdSet,
      getContextBoost?.(result.account.id),
    )
    const groupResults = resultsByPriority.get(priority) ?? []
    groupResults.push(result)
    resultsByPriority.set(priority, groupResults)
  }

  return [...resultsByPriority.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, results], groupIndex) =>
      results.map((result, index) => ({
        result,
        group: getAccountSortGroup(result.account, pinnedAccountIdSet),
        isLastInGroup: index === results.length - 1,
        startsNewGroup: groupIndex > 0 && index === 0,
      })),
    )
}
