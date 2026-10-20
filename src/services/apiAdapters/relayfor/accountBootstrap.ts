import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { RELAYFOR_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchRelayForUserInfo } from "~/services/apiService/relayfor"

export const relayForAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: async (request) => {
    const user = await fetchRelayForUserInfo(request)
    return {
      username: user.username,
      id: String(user.id),
      access_token: request.auth?.accessToken ?? "",
    }
  },
  getOrCreateAccessToken: async (request) => {
    const user = await fetchRelayForUserInfo(request)
    return {
      username: user.username,
      access_token: request.auth?.accessToken ?? "",
    }
  },
  loadBootstrapFacts: async (_request) => ({
    displayName: RELAYFOR_DISPLAY_NAME,
    checkInSupported: true,
    defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
  }),
  fetchCheckInSupport: async () => true,
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.RELAYFOR },
      route,
    ),
}
