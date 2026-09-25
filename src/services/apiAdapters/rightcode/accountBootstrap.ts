import { SITE_TYPES } from "~/constants/siteType"
import { RIGHTCODE_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  fetchRightCodePublicConfigs,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/rightcode"
import { toOptionalFiniteNumber } from "~/services/apiService/rightcode/parsing"

import { resolveStaticAccountRoutePath } from "../accountRoutes"

export const rightCodeAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: (request) => fetchUserInfo(request),
  // There is no "generate an access token" step: the account's own `user_token`
  // is the bearer credential the API and every exported client use.
  getOrCreateAccessToken: (request) => getOrCreateAccessToken(request),
  loadBootstrapFacts: async (request) => {
    // `public.balance.price` is the deployment's own CNY price for one site
    // dollar, which is exactly the rate the account's CNY display needs.
    const configs = await fetchRightCodePublicConfigs(request).catch(() => null)
    const rate = toOptionalFiniteNumber(configs?.["public.balance.price"])

    return {
      displayName: RIGHTCODE_DISPLAY_NAME,
      checkInSupported: false,
      ...(rate !== undefined && rate > 0 ? { defaultExchangeRate: rate } : {}),
    }
  },
  fetchCheckInSupport: () => fetchSupportCheckIn(),
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.RIGHT_CODE },
      route,
    ),
}
