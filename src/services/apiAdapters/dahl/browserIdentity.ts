import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { DAHL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { DAHL_ACCOUNT_ENDPOINT } from "~/services/apiService/dahl/constants"
import { parseDahlIdentity } from "~/services/apiService/dahl/identity"

export const dahlBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.DAHL && origin === DAHL_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    async verify(read) {
      return (
        parseDahlIdentity(
          await read({ url: `${origin}${DAHL_ACCOUNT_ENDPOINT}` }),
        )?.id ?? null
      )
    },
  }),
}
