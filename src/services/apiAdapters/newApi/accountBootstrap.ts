import type { AccountSiteType } from "~/constants/siteType"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import { accountBootstrap } from "~/services/apiService/newApiFamily"

import { resolveStaticAccountRoutePath } from "../accountRoutes"

/**
 * Create account-bootstrap operations bound to the New API-family site type.
 */
export function createNewApiAccountBootstrap(
  siteType: AccountSiteType,
): AccountBootstrapCapability {
  const implementation =
    accountBootstrap.createAccountBootstrapImplementation(siteType)

  return {
    fetchUserInfo: (request) => implementation.fetchUserInfo(request),
    getOrCreateAccessToken: (request) =>
      implementation.getOrCreateAccessToken(request),
    fetchSiteStatus: (request) => implementation.fetchSiteStatus(request),
    fetchCheckInSupport: (request) =>
      implementation.fetchSupportCheckIn(request),
    extractDefaultExchangeRate: (siteStatus) =>
      implementation.extractDefaultExchangeRate(siteStatus),
    resolveRoutePath: async (target, route) =>
      resolveStaticAccountRoutePath(target, route),
  }
}
