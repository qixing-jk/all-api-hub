import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"

import type { ContentSessionExtractor } from "../contracts"

const COMPATIBLE_USER_STORAGE_KEY = "user"

export const compatibleUserContentSessionExtractor: ContentSessionExtractor = {
  id: "compatible-user",
  canExtract: () => localStorage.getItem(COMPATIBLE_USER_STORAGE_KEY) !== null,
  async extract(context) {
    const rawUser = localStorage.getItem(COMPATIBLE_USER_STORAGE_KEY)
    if (!rawUser) return null

    let user: unknown
    try {
      user = JSON.parse(rawUser)
    } catch {
      return null
    }

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
