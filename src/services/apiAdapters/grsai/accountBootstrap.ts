import { SITE_TYPES } from "~/constants/siteType"
import { GRSAI_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/grsai"
import { GRSAI_CNY_PER_USD } from "~/services/apiService/grsai/parsing"

import { resolveStaticAccountRoutePath } from "../accountRoutes"

export const grsaiAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: (request) => fetchUserInfo(request),
  // There is no "generate an access token" step: the console session token is
  // the credential every console call accepts, so it doubles as the account
  // token and is re-read rather than created.
  getOrCreateAccessToken: (request) => getOrCreateAccessToken(request),
  loadBootstrapFacts: async () => ({
    displayName: GRSAI_DISPLAY_NAME,
    // The console sells credits for CNY and USD at its own published prices, so
    // the rate between them is the deployment's rather than the product default.
    defaultExchangeRate: GRSAI_CNY_PER_USD,
    // Product fact, not a probe result: the console has no check-in flow.
    checkInSupported: false,
  }),
  fetchCheckInSupport: () => fetchSupportCheckIn(),
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.GRSAI },
      route,
    ),
}
