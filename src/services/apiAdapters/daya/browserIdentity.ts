import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import {
  DAYA_WEB_ORIGIN,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { DAYA_ENDPOINTS } from "~/services/apiService/daya/constants"
import { parseDayaIdentity } from "~/services/apiService/daya/identity"

export const dayaBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.DAYA && origin === DAYA_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    cacheResult: false,
    async verify(read) {
      try {
        const body = await read({
          url: `${origin}${DAYA_ENDPOINTS.Identity}`,
        })
        const user = parseDayaIdentity(body)
        return String(user.id)
      } catch {
        return null
      }
    },
  }),
}
