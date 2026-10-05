import type { AccountSiteType } from "~/constants/siteType"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"

import { resolveNewApiAccountDataVariant } from "./accountDataVariant"

/**
 * Create account-data loading bound to the New API-family site type.
 */
export function createNewApiAccountData(
  siteType: AccountSiteType,
): AccountDataCapability {
  const { fetchAccountData } = resolveNewApiAccountDataVariant(siteType)

  return {
    fetchData: (request) => fetchAccountData(request),
  }
}
