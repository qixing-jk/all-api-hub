import type { AccountSiteType } from "~/constants/siteType"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { accountRefresh } from "~/services/apiService/newApiFamily"

/**
 * Create account-refresh operations bound to the New API-family site type.
 */
export function createNewApiAccountRefresh(
  siteType: AccountSiteType,
): AccountRefreshCapability {
  const implementation =
    accountRefresh.createAccountRefreshImplementation(siteType)

  return {
    fetchCheckInSupport: (request) =>
      implementation.fetchSupportCheckIn(request),
    refreshAccount: (request) => implementation.refreshAccountData(request),
  }
}
