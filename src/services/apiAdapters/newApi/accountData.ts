import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import * as accountData from "~/services/apiService/newApiFamily/default/accountData"
import * as anyrouter from "~/services/apiService/newApiFamily/variants/anyrouter"
import * as doneHub from "~/services/apiService/newApiFamily/variants/doneHub"
import * as veloera from "~/services/apiService/newApiFamily/variants/veloera"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"

const accountDataOverrides: Partial<
  Record<AccountSiteType, typeof accountData.fetchAccountData>
> = {
  [SITE_TYPES.ANYROUTER]: anyrouter.fetchAccountData,
  [SITE_TYPES.DONE_HUB]: doneHub.fetchAccountData,
  [SITE_TYPES.VELOERA]: veloera.fetchAccountData,
  [SITE_TYPES.WONG_GONGYI]: wong.fetchAccountData,
}

/**
 * Create account-data loading bound to the New API-family site type.
 */
export function createNewApiAccountData(
  siteType: AccountSiteType,
): AccountDataCapability {
  const fetchAccountData =
    accountDataOverrides[siteType] ??
    accountData.defaultAccountDataImplementation.fetchAccountData

  return {
    fetchData: (request) => fetchAccountData(request),
  }
}
