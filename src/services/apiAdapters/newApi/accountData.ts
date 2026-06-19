import type { AccountSiteType } from "~/constants/siteType"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { getApiService } from "~/services/apiService"

/**
 * Create account-data loading bound to the New API-family site type.
 */
export function createNewApiAccountData(
  siteType: AccountSiteType,
): AccountDataCapability {
  return {
    fetchData: (request) => getApiService(siteType).fetchAccountData(request),
  }
}
