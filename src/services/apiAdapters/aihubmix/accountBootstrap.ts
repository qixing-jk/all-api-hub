import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/aihubmix"

import { resolveStaticAccountRoutePath } from "../accountRoutes"

export const aihubmixAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: (request) => fetchUserInfo(request),
  getOrCreateAccessToken: (request) => getOrCreateAccessToken(request),
  // AIHubMix has quota accounting but no public status exchange-rate field.
  // https://docs.aihubmix.com/cn/api/CliEndpoints/list-keys
  loadBootstrapFacts: async () => ({
    displayName: "AIHubMix",
    checkInSupported: false,
    defaultExchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
  }),
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.AIHUBMIX },
      route,
    ),
}
