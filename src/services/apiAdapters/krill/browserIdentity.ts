import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import {
  KRILL_WEB_ORIGIN,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { KRILL_ENDPOINTS } from "~/services/apiService/krill/constants"
import { parseKrillIdentity } from "~/services/apiService/krill/identity"

export const krillBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.KRILL && origin === KRILL_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    cacheResult: false,
    async verify(read) {
      try {
        const body = await read({
          url: `${origin}${KRILL_ENDPOINTS.Identity}`,
        })
        const user = parseKrillIdentity(body)
        return String(user.id)
      } catch {
        return null
      }
    },
  }),
}
