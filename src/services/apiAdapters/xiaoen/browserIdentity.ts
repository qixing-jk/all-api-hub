import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import {
  SITE_TYPES,
  XIAOEN_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { XIAOEN_ENDPOINTS } from "~/services/apiService/xiaoen/constants"
import { parseXiaoenIdentity } from "~/services/apiService/xiaoen/identity"

export const xiaoenBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.XIAOEN && origin === XIAOEN_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    cacheResult: false,
    async verify(read) {
      return (
        parseXiaoenIdentity(
          await read({ url: `${origin}${XIAOEN_ENDPOINTS.Identity}` }),
        )?.id ?? null
      )
    },
  }),
}
