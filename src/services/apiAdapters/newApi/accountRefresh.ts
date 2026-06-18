import type { AccountSiteType } from "~/constants/siteType"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { getApiService } from "~/services/apiService"

/**
 * Create account-refresh operations bound to the New API-family site type.
 */
export function createNewApiAccountRefresh(
  siteType: AccountSiteType,
): AccountRefreshCapability {
  return {
    fetchCheckInSupport: (request) =>
      getApiService(siteType).fetchSupportCheckIn(request),
    refreshAccount: (request) =>
      getApiService(siteType).refreshAccountData(request),
  }
}
