import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { readIdentityStorageRecord } from "~/services/accountBrowserSession/localIdentityState"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"

import type { ContentSessionExtractor } from "../contracts"

const COMPATIBLE_USER_STORAGE_KEY = "user"

/** Shared local hint reader for onboarding and passive browser identity checks. */
export function readCompatibleStoredUser() {
  return readIdentityStorageRecord(COMPATIBLE_USER_STORAGE_KEY)
}

export const compatibleUserContentSessionExtractor: ContentSessionExtractor = {
  id: "compatible-user",
  canExtract: () => localStorage.getItem(COMPATIBLE_USER_STORAGE_KEY) !== null,
  async extract(context) {
    const user = readCompatibleStoredUser()
    if (!user) return null

    const siteType = isAccountSiteType(context.siteTypeHint)
      ? context.siteTypeHint
      : SITE_TYPES.UNKNOWN
    const identity = resolveStoredAccountUserIdentity(user, siteType)
    if (!identity) return null

    return {
      ...identity,
      ...(siteType !== SITE_TYPES.UNKNOWN ? { siteTypeHint: siteType } : {}),
    }
  },
}
