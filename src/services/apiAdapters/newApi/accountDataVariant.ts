import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import * as accountData from "~/services/apiService/newApiFamily/default/accountData"
import * as accountRefresh from "~/services/apiService/newApiFamily/default/accountRefresh"
import * as anyrouter from "~/services/apiService/newApiFamily/variants/anyrouter"
import * as doneHub from "~/services/apiService/newApiFamily/variants/doneHub"
import { LAOZHANG_TODAY_LOG_QUERY_CONFIG } from "~/services/apiService/newApiFamily/variants/laozhang"
import * as rixApi from "~/services/apiService/newApiFamily/variants/rixApi"
import * as veloera from "~/services/apiService/newApiFamily/variants/veloera"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"
import type { TodayLogQueryConfig } from "~/services/history/usageHistory/usageLogModel"

type AccountDataVariant = typeof accountData.defaultAccountDataImplementation &
  typeof accountRefresh.defaultAccountRefreshImplementation

// A custom data loader must define the matching refresh operation alongside it.
type AccountDataVariantOverride = Pick<
  AccountDataVariant,
  "fetchAccountData" | "refreshAccountData"
> &
  Partial<Pick<AccountDataVariant, "fetchSupportCheckIn">>

/** Binds one usage-log dialect to both snapshot loading and health-state refresh. */
function createLogQueryVariant(
  queryConfig: TodayLogQueryConfig,
): AccountDataVariantOverride {
  return {
    fetchAccountData: (request) =>
      accountData.fetchAccountData(request, queryConfig),
    refreshAccountData: (request) =>
      accountRefresh.refreshAccountData(request, queryConfig),
  }
}

const overrides: Partial<Record<AccountSiteType, AccountDataVariantOverride>> =
  {
    [SITE_TYPES.ANYROUTER]: {
      fetchAccountData: anyrouter.fetchAccountData,
      refreshAccountData: anyrouter.refreshAccountData,
      fetchSupportCheckIn: anyrouter.fetchSupportCheckIn,
    },
    [SITE_TYPES.DONE_HUB]: {
      fetchAccountData: doneHub.fetchAccountData,
      refreshAccountData: doneHub.refreshAccountData,
    },
    [SITE_TYPES.LAOZHANG]: createLogQueryVariant(
      LAOZHANG_TODAY_LOG_QUERY_CONFIG,
    ),
    [SITE_TYPES.RIX_API]: {
      fetchAccountData: rixApi.fetchAccountData,
      refreshAccountData: rixApi.refreshAccountData,
    },
    [SITE_TYPES.VELOERA]: {
      fetchAccountData: veloera.fetchAccountData,
      refreshAccountData: veloera.refreshAccountData,
      fetchSupportCheckIn: veloera.fetchSupportCheckIn,
    },
    [SITE_TYPES.WONG_GONGYI]: {
      fetchAccountData: wong.fetchAccountData,
      refreshAccountData: wong.refreshAccountData,
      fetchSupportCheckIn: wong.fetchSupportCheckIn,
    },
  }

/** Resolves one paired account-data implementation for both capability factories. */
export function resolveNewApiAccountDataVariant(
  siteType: AccountSiteType,
): AccountDataVariant {
  return {
    ...accountData.defaultAccountDataImplementation,
    ...accountRefresh.defaultAccountRefreshImplementation,
    ...overrides[siteType],
  }
}
