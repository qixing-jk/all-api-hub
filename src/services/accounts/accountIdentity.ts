import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountIdentity } from "~/types"

const NUMERIC_MANUAL_ACCOUNT_ID_SITE_TYPES: ReadonlySet<AccountSiteType> =
  new Set([
    SITE_TYPES.ONE_API,
    SITE_TYPES.NEW_API,
    SITE_TYPES.ANYROUTER,
    SITE_TYPES.VELOERA,
    SITE_TYPES.ONE_HUB,
    SITE_TYPES.DONE_HUB,
    SITE_TYPES.V_API,
    SITE_TYPES.VO_API,
    SITE_TYPES.SUPER_API,
    SITE_TYPES.RIX_API,
    SITE_TYPES.NEO_API,
    SITE_TYPES.WONG_GONGYI,
    SITE_TYPES.UNKNOWN,
  ])

const POSITIVE_INTEGER_ID_PATTERN = /^[1-9]\d*$/

type StoredAccountUserIdentity = {
  userId: AccountIdentity
  user: Record<string, unknown>
}

/**
 * Normalizes account identity values from storage, auto-detect, and adapters.
 */
export function normalizeAccountIdentity(
  value: unknown,
): AccountIdentity | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

/**
 * Resolves the account identity from a user object read from site storage.
 */
export function resolveStoredAccountUserIdentity(
  user: unknown,
  siteType: AccountSiteType,
): StoredAccountUserIdentity | null {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null

  const userRecord = user as Record<string, unknown>
  const identitySource =
    siteType === SITE_TYPES.AIHUBMIX ? userRecord.username : userRecord.id
  const userId = normalizeAccountIdentity(identitySource)

  if (!userId) return null

  return {
    userId,
    user: userRecord,
  }
}

/**
 * Normalizes an account identity while preserving a caller-defined fallback.
 */
export function coerceAccountIdentity(
  value: unknown,
  fallback: AccountIdentity,
): AccountIdentity {
  return normalizeAccountIdentity(value) ?? fallback
}

/**
 * Returns whether manually entered identities must be numeric for the site.
 */
export function requiresNumericManualAccountIdentity(
  siteType: AccountSiteType,
): boolean {
  return NUMERIC_MANUAL_ACCOUNT_ID_SITE_TYPES.has(siteType)
}

/**
 * Validates manual account identity using the site-specific input strategy.
 */
export function isValidManualAccountIdentity(
  identity: AccountIdentity,
  siteType: AccountSiteType,
): boolean {
  const normalizedIdentity = normalizeAccountIdentity(identity)
  if (!normalizedIdentity) return false

  if (!requiresNumericManualAccountIdentity(siteType)) return true

  return POSITIVE_INTEGER_ID_PATTERN.test(normalizedIdentity)
}
