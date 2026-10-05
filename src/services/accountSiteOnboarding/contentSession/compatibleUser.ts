import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { compatibleStoredUserHint } from "~/services/accountBrowserSession/newApiStoredUserHint"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"

import type { ContentSessionExtractor } from "../contracts"

export const compatibleUserContentSessionExtractor: ContentSessionExtractor = {
  id: "compatible-user",
  canExtract: () => compatibleStoredUserHint.isPresent(),
  async extract(context) {
    const user = compatibleStoredUserHint.read()
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
