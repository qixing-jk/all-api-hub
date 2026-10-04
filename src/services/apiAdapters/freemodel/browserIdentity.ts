import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { FREEMODEL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { FREEMODEL_ME_ENDPOINT } from "~/services/apiService/freemodel/constants"
import { isRecord } from "~/utils/core/object"

export const freeModelBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.FREEMODEL && origin === FREEMODEL_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    async verify(read) {
      const body = await read({ url: `${origin}${FREEMODEL_ME_ENDPOINT}` })
      const id = isRecord(body?.user) ? body.user.id : undefined
      return typeof id === "number" && Number.isSafeInteger(id) && id > 0
        ? id
        : null
    },
  }),
}
