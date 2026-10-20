import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { EMRANK_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { EMRANK_ENDPOINTS } from "~/services/apiService/emrank/constants"
import { parseEmRankIdentity } from "~/services/apiService/emrank/identity"

export const emRankBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.EMRANK && origin === EMRANK_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    // The HttpOnly session cookie cannot invalidate document.cookie identity
    // caches, so every verification re-reads the live session.
    cacheResult: false,
    async verify(read) {
      const user = parseEmRankIdentity(
        await read({ url: `${origin}${EMRANK_ENDPOINTS.Identity}` }),
      )
      return user?.id ?? null
    },
  }),
}
