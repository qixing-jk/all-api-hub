import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import {
  FOXCODE_WEB_ORIGIN,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { FOXCODE_ENDPOINTS } from "~/services/apiService/foxcode/constants"
import { parseFoxCodeIdentity } from "~/services/apiService/foxcode/identity"

export const foxCodeBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.FOXCODE && origin === FOXCODE_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    cacheResult: false,
    async verify(read) {
      return (
        parseFoxCodeIdentity(
          await read({ url: `${origin}${FOXCODE_ENDPOINTS.Identity}` }),
        )?.id ?? null
      )
    },
  }),
}
