import { SITE_TYPES } from "~/constants/siteType"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  extractDefaultExchangeRate,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/aihubmix"

import { resolveStaticAccountRoutePath } from "../accountRoutes"

export const aihubmixAccountBootstrap: AccountBootstrapCapability = {
  fetchUserInfo: (request) => fetchUserInfo(request),
  getOrCreateAccessToken: (request) => getOrCreateAccessToken(request),
  fetchSiteStatus: (request) => fetchSiteStatus(request),
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  extractDefaultExchangeRate: (siteStatus) =>
    extractDefaultExchangeRate(siteStatus),
  resolveRoutePath: async (target, route) =>
    resolveStaticAccountRoutePath(
      { ...target, siteType: SITE_TYPES.AIHUBMIX },
      route,
    ),
}
