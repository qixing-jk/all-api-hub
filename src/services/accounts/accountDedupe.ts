import { SITE_TYPES } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { normalizeAccountSiteUrlForDuplicateCheck } from "~/services/accounts/utils/siteUrlNormalization"
import type { SiteAccount } from "~/types"

export type AccountDedupeKeepStrategy =
  | "keepPinned"
  | "keepEnabled"
  | "keepMostRecentlyUpdated"

const ACCOUNT_DEDUPE_REASONS = {
  SameOriginUser: "same_origin_user",
  SameCredential: "same_credential",
} as const

type DuplicateAccountKeyBase = {
  id: string
  origin: string
}

type SameOriginUserDuplicateAccountKey = DuplicateAccountKeyBase & {
  reason: typeof ACCOUNT_DEDUPE_REASONS.SameOriginUser
  userId: string
}

type SameCredentialDuplicateAccountKey = DuplicateAccountKeyBase & {
  reason: typeof ACCOUNT_DEDUPE_REASONS.SameCredential
  siteType: SiteAccount["site_type"]
}

export type DuplicateAccountKey =
  | SameOriginUserDuplicateAccountKey
  | SameCredentialDuplicateAccountKey

type DuplicateAccountKeyMetadata =
  | Omit<SameOriginUserDuplicateAccountKey, "id">
  | Omit<SameCredentialDuplicateAccountKey, "id">

export type DuplicateAccountGroup = {
  key: DuplicateAccountKey
  accounts: SiteAccount[]
  keepAccountId: string
  deleteAccountIds: string[]
}

type DuplicateAccountsScanResult = {
  groups: DuplicateAccountGroup[]
  unscannable: SiteAccount[]
}

type AccountScoreInput = {
  account: SiteAccount
  pinnedIds: ReadonlySet<string>
}

/** Returns whether an account participates as enabled. */
function isEnabled(account: Pick<SiteAccount, "disabled">): boolean {
  return account.disabled !== true
}

/** Returns whether an account is pinned locally. */
function isPinned({ account, pinnedIds }: AccountScoreInput): boolean {
  return pinnedIds.has(account.id)
}

/** Compares numeric ranking values in descending order. */
function compareNumberDesc(a: number, b: number): number {
  return b - a
}

/** Compares boolean ranking values with true first. */
function compareBooleanDesc(a: boolean, b: boolean): number {
  return Number(b) - Number(a)
}

/** Compares deterministic string tie-breakers in ascending order. */
function compareStringAsc(a: string, b: string): number {
  return a.localeCompare(b)
}

/** Normalizes unknown timestamps for deterministic ranking. */
function getComparableTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** Builds the account ordering used to select a record to keep. */
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

/** Returns the exact non-blank credential only for OpenRouter accounts. */
function getOwnedCredentialKey(account: SiteAccount): string | undefined {
  if (account.site_type !== SITE_TYPES.OPENROUTER) {
    return undefined
  }
  const credential = account.account_info.access_token?.trim()
  return credential || undefined
}

/** Finds an exact local-credential duplicate without exposing account data. */
export function findExactCredentialDuplicateAccountId(input: {
  accounts: SiteAccount[]
  siteType: SiteAccount["site_type"]
  accessToken: string
  excludeAccountId?: string
}): string | undefined {
  const candidate = input.accessToken.trim()
  if (!candidate) return undefined

  return input.accounts
    .filter(
      (account) =>
        account.id !== input.excludeAccountId &&
        account.site_type === input.siteType &&
        getOwnedCredentialKey(account) === candidate,
    )
    .map((account) => account.id)
    .sort((a, b) => a.localeCompare(b))[0]
}

/**
 * Scans accounts for duplicate groups while retaining the original records for
 * the caller-owned preview and deletion flow.
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
    { key: DuplicateAccountKeyMetadata; accounts: SiteAccount[] }
  >()

  for (const account of input.accounts) {
    const origin = normalizeAccountSiteUrlForDuplicateCheck({
      url: account.site_url,
      siteType: account.site_type,
    })
    if (!origin) {
      unscannable.push(account)
      continue
    }

    const ownedCredential = getOwnedCredentialKey(account)
    if (account.site_type === SITE_TYPES.OPENROUTER && !ownedCredential) {
      unscannable.push(account)
      continue
    }

    const userId = normalizeAccountIdentity(account.account_info?.id)
    if (!ownedCredential && userId === null) {
      unscannable.push(account)
      continue
    }

    const key: DuplicateAccountKeyMetadata = ownedCredential
      ? {
          origin,
          siteType: account.site_type,
          reason: ACCOUNT_DEDUPE_REASONS.SameCredential,
        }
      : {
          origin,
          reason: ACCOUNT_DEDUPE_REASONS.SameOriginUser,
          userId: userId!,
        }
    const keyString = ownedCredential
      ? `${origin}::${account.site_type}::credential::${ownedCredential}`
      : `${origin}::user::${userId}`
    const existing = groupsByKey.get(keyString)
    if (existing) {
      existing.accounts.push(account)
    } else {
      groupsByKey.set(keyString, { key, accounts: [account] })
    }
  }

  const comparator = buildKeepComparator(input.strategy, pinnedIds)
  const groups = Array.from(groupsByKey.values())
    .filter((group) => group.accounts.length > 1)
    .map((group) => {
      const sorted = [...group.accounts].sort(comparator)
      const accountIds = group.accounts.map((account) => account.id)
      const keyId = JSON.stringify([...accountIds].sort(compareStringAsc))
      const keepAccountId = sorted[0].id
      return {
        key: { ...group.key, id: keyId },
        accounts: group.accounts,
        keepAccountId,
        deleteAccountIds: accountIds.filter((id) => id !== keepAccountId),
      }
    })
    .sort((a, b) => {
      const originCompare = a.key.origin.localeCompare(b.key.origin)
      if (originCompare !== 0) return originCompare
      const aIdentity =
        a.key.reason === ACCOUNT_DEDUPE_REASONS.SameCredential
          ? a.key.siteType
          : a.key.userId
      const bIdentity =
        b.key.reason === ACCOUNT_DEDUPE_REASONS.SameCredential
          ? b.key.siteType
          : b.key.userId
      return `${a.key.reason}:${aIdentity}:${a.key.id}`.localeCompare(
        `${b.key.reason}:${bIdentity}:${b.key.id}`,
      )
    })

  return { groups, unscannable }
}
