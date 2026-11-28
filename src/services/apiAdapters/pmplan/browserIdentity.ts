import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { PMPLAN_ENDPOINTS } from "~/services/apiService/pmplan/constants"
import { getPmplanOrigin } from "~/services/apiService/pmplan/deployment"
import { parsePmplanIdentity } from "~/services/apiService/pmplan/identity"

export const pmplanBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) => {
    if (siteType !== SITE_TYPES.PMPLAN) return false
    try {
      return getPmplanOrigin(origin) === origin
    } catch {
      return false
    }
  },
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    cacheResult: false,
    async verify(read) {
      return (
        parsePmplanIdentity(
          await read({ url: `${origin}${PMPLAN_ENDPOINTS.Identity}` }),
        )?.id ?? null
      )
    },
  }),
}
