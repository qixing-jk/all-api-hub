import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"

import type { ContentSessionExtractor } from "../contracts"

export const compatibleUserContentSessionExtractor: ContentSessionExtractor = {
  id: "compatible-user",
  canExtract: () => true,
  async extract(context) {
    const rawUser = localStorage.getItem("user")
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
