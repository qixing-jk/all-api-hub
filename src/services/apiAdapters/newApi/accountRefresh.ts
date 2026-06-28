import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import * as accountRefresh from "~/services/apiService/newApiFamily/default/accountRefresh"
import * as anyrouter from "~/services/apiService/newApiFamily/variants/anyrouter"
import * as doneHub from "~/services/apiService/newApiFamily/variants/doneHub"
import * as veloera from "~/services/apiService/newApiFamily/variants/veloera"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"

type AccountRefreshImplementation =
  typeof accountRefresh.defaultAccountRefreshImplementation

const accountRefreshOverrides: Partial<
  Record<AccountSiteType, Partial<AccountRefreshImplementation>>
> = {
  [SITE_TYPES.ANYROUTER]: {
    fetchSupportCheckIn: anyrouter.fetchSupportCheckIn,
    refreshAccountData: anyrouter.refreshAccountData,
  },
  [SITE_TYPES.DONE_HUB]: {
    refreshAccountData: doneHub.refreshAccountData,
  },
  [SITE_TYPES.VELOERA]: {
    refreshAccountData: veloera.refreshAccountData,
  },
  [SITE_TYPES.WONG_GONGYI]: {
    fetchSupportCheckIn: wong.fetchSupportCheckIn,
    refreshAccountData: wong.refreshAccountData,
  },
}

/**
 * Create account-refresh operations bound to the New API-family site type.
 */
export function createNewApiAccountRefresh(
  siteType: AccountSiteType,
): AccountRefreshCapability {
  const implementation = {
    ...accountRefresh.defaultAccountRefreshImplementation,
    ...accountRefreshOverrides[siteType],
  }

  return {
    fetchCheckInSupport: (request) =>
      implementation.fetchSupportCheckIn(request),
    refreshAccount: (request) => implementation.refreshAccountData(request),
  }
}
