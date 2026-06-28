import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountData } from "~/services/accountData/model"
import * as anyrouterAccountData from "~/services/apiService/anyrouter"
import * as commonAccountData from "~/services/apiService/common"
import type { ApiServiceAccountRequest } from "~/services/apiService/common/type"
import * as doneHubAccountData from "~/services/apiService/doneHub"
import * as veloeraAccountData from "~/services/apiService/veloera"
import * as wongAccountData from "~/services/apiService/wong"

interface AccountDataImplementation {
  fetchAccountData: (request: ApiServiceAccountRequest) => Promise<AccountData>
}

const defaultAccountDataImplementation: AccountDataImplementation = {
  fetchAccountData: commonAccountData.fetchAccountData,
}

const accountDataOverrides: Partial<
  Record<AccountSiteType, Partial<AccountDataImplementation>>
> = {
  [SITE_TYPES.ANYROUTER]: {
    fetchAccountData: anyrouterAccountData.fetchAccountData,
  },
  [SITE_TYPES.DONE_HUB]: {
    fetchAccountData: doneHubAccountData.fetchAccountData,
  },
  [SITE_TYPES.VELOERA]: {
    fetchAccountData: veloeraAccountData.fetchAccountData,
  },
  [SITE_TYPES.WONG_GONGYI]: {
    fetchAccountData: wongAccountData.fetchAccountData,
  },
}

const getAccountDataImplementation = (
  siteType: AccountSiteType,
): AccountDataImplementation => ({
  ...defaultAccountDataImplementation,
  ...accountDataOverrides[siteType],
})

/**
 * Create account-data loading bound to a New API-family site type.
 */
export function createAccountDataImplementation(
  siteType: AccountSiteType,
): AccountDataImplementation {
  const implementation = getAccountDataImplementation(siteType)

  return {
    fetchAccountData: (request) => implementation.fetchAccountData(request),
  }
}
