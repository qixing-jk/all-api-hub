import { SITE_TYPES } from "~/constants/siteType"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { readRelayForBrowserToken } from "~/services/apiService/relayfor/browserSession"
import { RELAYFOR_ENDPOINTS } from "~/services/apiService/relayfor/constants"
import { isRelayForUser } from "~/services/apiService/relayfor/parsing"

export const relayForBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) => siteType === SITE_TYPES.RELAYFOR,
  observe({ origin }) {
    const token = readRelayForBrowserToken()
    if (!token) return null
    return {
      sessionKey: token,
      async verify(read) {
        const body = await read({
          url: `${origin}${RELAYFOR_ENDPOINTS.self}`,
          headers: { Authorization: `Bearer ${token}` },
        })
        return isRelayForUser(body) ? body.username : null
      },
    }
  },
}
