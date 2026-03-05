import type { SiteAccount } from "~/types"
import { sanitizeOriginUrl } from "~/utils/core/url"

export type AccountDedupeKeepStrategy =
  | "keepPinned"
  | "keepEnabled"
  | "keepMostRecentlyUpdated"

export type DuplicateAccountKey = {
  origin: string
  userId: number
}

export type DuplicateAccountGroup = {
  key: DuplicateAccountKey
  accounts: SiteAccount[]
  keepAccountId: string
  deleteAccountIds: string[]
}

export type DuplicateAccountsScanResult = {
  groups: DuplicateAccountGroup[]
  unscannable: SiteAccount[]
}

type AccountScoreInput = {
  account: SiteAccount
  pinnedIds: ReadonlySet<string>
}

/**
 *
 */
function isEnabled(account: Pick<SiteAccount, "disabled">): boolean {
  return account.disabled !== true
}

/**
 *
 */
function isPinned({ account, pinnedIds }: AccountScoreInput): boolean {
  return pinnedIds.has(account.id)
}

/**
 *
 */
function compareNumberDesc(a: number, b: number): number {
  return b - a
}

/**
 *
 */
function compareBooleanDesc(a: boolean, b: boolean): number {
  return Number(b) - Number(a)
}

/**
 *
 */
function compareStringAsc(a: string, b: string): number {
  return a.localeCompare(b)
}

/**
 *
 */
function getComparableTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 *
 */
function coerceFiniteUserId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 *
 */
function buildKeepComparator(
  strategy: AccountDedupeKeepStrategy,
  pinnedIds: ReadonlySet<string>,
) {
  return (a: SiteAccount, b: SiteAccount) => {
    const aPinned = isPinned({ account: a, pinnedIds })
    const bPinned = isPinned({ account: b, pinnedIds })
    const aEnabled = isEnabled(a)
    const bEnabled = isEnabled(b)
    const aUpdatedAt = getComparableTimestamp(a.updated_at)
    const bUpdatedAt = getComparableTimestamp(b.updated_at)
    const aCreatedAt = getComparableTimestamp(a.created_at)
    const bCreatedAt = getComparableTimestamp(b.created_at)

    const compareBy = (...comparators: Array<() => number>) => {
      for (const comparator of comparators) {
        const result = comparator()
        if (result !== 0) return result
      }
      return 0
    }

    const tieBreakers = () =>
      compareBy(
        () => compareNumberDesc(aCreatedAt, bCreatedAt),
        () => compareStringAsc(a.id, b.id),
      )

    if (strategy === "keepPinned") {
      return compareBy(
        () => compareBooleanDesc(aPinned, bPinned),
        () => compareBooleanDesc(aEnabled, bEnabled),
        () => compareNumberDesc(aUpdatedAt, bUpdatedAt),
        tieBreakers,
      )
    }

    if (strategy === "keepEnabled") {
      return compareBy(
        () => compareBooleanDesc(aEnabled, bEnabled),
        () => compareBooleanDesc(aPinned, bPinned),
        () => compareNumberDesc(aUpdatedAt, bUpdatedAt),
        tieBreakers,
      )
    }

    return compareBy(
      () => compareNumberDesc(aUpdatedAt, bUpdatedAt),
      () => compareBooleanDesc(aEnabled, bEnabled),
      () => compareBooleanDesc(aPinned, bPinned),
      tieBreakers,
    )
  }
}

/**
 *
 */
export function scanDuplicateAccounts(input: {
  accounts: SiteAccount[]
  pinnedAccountIds?: string[]
  strategy: AccountDedupeKeepStrategy
}): DuplicateAccountsScanResult {
  const pinnedIds = new Set(input.pinnedAccountIds ?? [])
  const unscannable: SiteAccount[] = []
  const groupsByKey = new Map<
    string,
    { key: DuplicateAccountKey; accounts: SiteAccount[] }
  >()

  for (const account of input.accounts) {
    const origin = sanitizeOriginUrl(account.site_url)
    const userId = coerceFiniteUserId(account.account_info?.id)

    if (!origin || userId === undefined) {
      unscannable.push(account)
      continue
    }

    const keyString = `${origin}::${userId}`
    const existing = groupsByKey.get(keyString)
    if (existing) {
      existing.accounts.push(account)
      continue
    }

    groupsByKey.set(keyString, {
      key: { origin, userId },
      accounts: [account],
    })
  }

  const comparator = buildKeepComparator(input.strategy, pinnedIds)

  const groups: DuplicateAccountGroup[] = Array.from(groupsByKey.values())
    .filter((group) => group.accounts.length > 1)
    .map((group) => {
      const sorted = [...group.accounts].sort(comparator)
      const keep = sorted[0]
      return {
        key: group.key,
        accounts: group.accounts,
        keepAccountId: keep.id,
        deleteAccountIds: group.accounts
          .filter((account) => account.id !== keep.id)
          .map((account) => account.id),
      }
    })
    .sort((a, b) => {
      const originCompare = a.key.origin.localeCompare(b.key.origin)
      if (originCompare !== 0) return originCompare
      return a.key.userId - b.key.userId
    })

  return { groups, unscannable }
}
