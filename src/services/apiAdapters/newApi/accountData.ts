import type { AccountSiteType } from "~/constants/siteType"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { accountData } from "~/services/apiService/newApiFamily"

/**
 * Create account-data loading bound to the New API-family site type.
 */
export function createNewApiAccountData(
  siteType: AccountSiteType,
): AccountDataCapability {
  const implementation = accountData.createAccountDataImplementation(siteType)

  return {
    fetchData: (request) => implementation.fetchAccountData(request),
  }
}
