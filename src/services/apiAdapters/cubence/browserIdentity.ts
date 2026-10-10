import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { CUBENCE_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { isRecord } from "~/utils/core/object"

export const cubenceBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.CUBENCE && origin === CUBENCE_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    // The HttpOnly token cannot invalidate document.cookie-based identity caches.
    cacheResult: false,
    async verify(read) {
      const body = await read({ url: `${origin}/api/v1/auth/me` })
      const user = isRecord(body?.user) ? body.user : undefined
      return user?.active === true &&
        typeof user.id === "number" &&
        Number.isSafeInteger(user.id) &&
        user.id > 0
        ? user.id
        : null
    },
  }),
}
