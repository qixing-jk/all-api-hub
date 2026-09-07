import type { AccountSiteType } from "~/constants/siteType"
import type { AccountIdentity } from "~/types"

import { getAccountSiteProductProfile } from "./registry"

/**
 * Normalizes account-site identity field values into persisted string form.
 */
function normalizeIdentityValue(value: unknown): AccountIdentity | null {
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
 * Resolves the first usable user identity field declared by the site profile.
 */
export function resolveAccountSiteUserIdentity({
  siteType,
  user,
}: {
  siteType: AccountSiteType
  user: unknown
}): AccountIdentity | null {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null

  const userRecord = user as Record<string, unknown>
  const profile = getAccountSiteProductProfile(siteType)

  for (const field of profile.identity.storedUserIdentityFields) {
    const identity = normalizeIdentityValue(userRecord[field])
    if (identity) return identity
  }

  return null
}
