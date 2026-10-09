import type { AccountSiteType } from "~/constants/siteType"
import { resolveAccountSiteUserIdentity } from "~/services/accounts/accountSiteProfile/identity"
import type { AccountIdentity, SiteAccount } from "~/types"

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
  const userId = resolveAccountSiteUserIdentity({
    siteType,
    user: userRecord,
  })

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

/** Identity whose remote account facts a refresh is allowed to update. */
export const hasSameAccountRequestIdentity = (
  account: SiteAccount,
  snapshot: SiteAccount,
) =>
  account.id === snapshot.id &&
  account.site_type === snapshot.site_type &&
  account.site_url === snapshot.site_url &&
  normalizeAccountIdentity(account.account_info.id) ===
    normalizeAccountIdentity(snapshot.account_info.id)

/** Credential changes invalidate completed check-in discovery after a form save. */
export const hasSameCheckInRequestCredentials = (
  account: SiteAccount,
  snapshot: SiteAccount,
) =>
  hasSameAccountRequestIdentity(account, snapshot) &&
  account.authType === snapshot.authType &&
  account.account_info.access_token === snapshot.account_info.access_token &&
  account.cookieAuth?.sessionCookie === snapshot.cookieAuth?.sessionCookie
