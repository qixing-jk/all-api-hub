import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { REQUESTY_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { resolveRequestyAccountUserId } from "~/services/apiAdapters/requesty/account/accountIdentity"
import {
  fetchRequestyAccountIdentity,
  fetchRequestySelfKeyInfo,
} from "~/services/apiService/requesty"

export const requestyAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: async (request) => {
    const info = await fetchRequestyAccountIdentity(request)
    return {
      username: info.orgName,
      id: resolveRequestyAccountUserId(info.orgId, request.auth?.userId),
      access_token: request.auth?.accessToken ?? "",
    }
  },
  getOrCreateAccessToken: async (request) => {
    // Creating another manage key would silently duplicate a credential; the
    // user is guided to create one in the console instead.
    const info = await fetchRequestySelfKeyInfo(request)
    return {
      username: info.orgName,
      access_token: request.auth?.accessToken ?? "",
    }
  },
  loadBootstrapFacts: async () => ({
    displayName: REQUESTY_DISPLAY_NAME,
    checkInSupported: false,
    defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
  }),
  fetchCheckInSupport: async () => false,
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.REQUESTY },
      route,
    ),
}
