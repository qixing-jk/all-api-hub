import type { AccountSiteType } from "~/constants/siteType"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { getApiService } from "~/services/apiService"

import { resolveStaticAccountRoutePath } from "../accountRoutes"

/**
 * Create account-bootstrap operations bound to the New API-family site type.
 */
export function createNewApiAccountBootstrap(
  siteType: AccountSiteType,
): AccountBootstrapCapability {
  return {
    fetchUserInfo: (request) => getApiService(siteType).fetchUserInfo(request),
    getOrCreateAccessToken: (request) =>
      getApiService(siteType).getOrCreateAccessToken(request),
    fetchSiteStatus: (request) =>
      getApiService(siteType).fetchSiteStatus(request),
    fetchCheckInSupport: (request) =>
      getApiService(siteType).fetchSupportCheckIn(request),
    extractDefaultExchangeRate: (siteStatus) =>
      getApiService(siteType).extractDefaultExchangeRate(siteStatus),
    resolveRoutePath: async (target, route) =>
      resolveStaticAccountRoutePath(target, route),
  }
}
