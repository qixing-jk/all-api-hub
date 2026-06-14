import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountIdentity } from "~/types"

type StoredAccountUserIdentity = {
  userId: AccountIdentity
  user: Record<string, unknown>
}

/**
 * Normalizes account identity values from storage, auto-detect, and adapters.
 * Account-site identities are persisted as strings because compatible
 * deployments may expose alphanumeric IDs.
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
