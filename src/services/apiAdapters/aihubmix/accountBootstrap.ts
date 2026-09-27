import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
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
    defaultExchangeRate: DEFAULT_USD_TO_CNY_RATE,
  }),
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.AIHUBMIX },
      route,
    ),
}
