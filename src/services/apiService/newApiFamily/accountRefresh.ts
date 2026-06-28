import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { RefreshAccountResult } from "~/services/accountData/model"
import * as anyrouterAccountRefresh from "~/services/apiService/anyrouter"
import * as commonAccountRefresh from "~/services/apiService/common"
import type { ApiServiceAccountRequest } from "~/services/apiService/common/type"
import * as doneHubAccountRefresh from "~/services/apiService/doneHub"
import * as veloeraAccountRefresh from "~/services/apiService/veloera"
import * as wongAccountRefresh from "~/services/apiService/wong"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

interface AccountRefreshImplementation {
  fetchSupportCheckIn: (
    request: ApiServiceRequest,
  ) => Promise<boolean | undefined>
  refreshAccountData: (
    request: ApiServiceAccountRequest,
  ) => Promise<RefreshAccountResult>
}

const defaultAccountRefreshImplementation: AccountRefreshImplementation = {
  fetchSupportCheckIn: commonAccountRefresh.fetchSupportCheckIn,
  refreshAccountData: commonAccountRefresh.refreshAccountData,
}

const accountRefreshOverrides: Partial<
  Record<AccountSiteType, Partial<AccountRefreshImplementation>>
> = {
  [SITE_TYPES.ANYROUTER]: {
    fetchSupportCheckIn: anyrouterAccountRefresh.fetchSupportCheckIn,
    refreshAccountData: anyrouterAccountRefresh.refreshAccountData,
  },
  [SITE_TYPES.DONE_HUB]: {
    refreshAccountData: doneHubAccountRefresh.refreshAccountData,
  },
  [SITE_TYPES.VELOERA]: {
    refreshAccountData: veloeraAccountRefresh.refreshAccountData,
  },
  [SITE_TYPES.WONG_GONGYI]: {
    fetchSupportCheckIn: wongAccountRefresh.fetchSupportCheckIn,
    refreshAccountData: wongAccountRefresh.refreshAccountData,
  },
}

const getAccountRefreshImplementation = (
  siteType: AccountSiteType,
): AccountRefreshImplementation => ({
  ...defaultAccountRefreshImplementation,
  ...accountRefreshOverrides[siteType],
})

/**
 * Create account-refresh operations bound to a New API-family site type.
 */
export function createAccountRefreshImplementation(
  siteType: AccountSiteType,
): AccountRefreshImplementation {
  const implementation = getAccountRefreshImplementation(siteType)

  return {
    fetchSupportCheckIn: (request) =>
      implementation.fetchSupportCheckIn(request),
    refreshAccountData: (request) => implementation.refreshAccountData(request),
  }
}
