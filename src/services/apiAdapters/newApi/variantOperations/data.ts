import * as accountData from "~/services/apiService/newApiFamily/default/accountData"
import * as accountRefresh from "~/services/apiService/newApiFamily/default/accountRefresh"
import type { TodayLogQueryConfig } from "~/services/history/usageHistory/usageLogModel"

export type AccountDataVariant =
  typeof accountData.defaultAccountDataImplementation &
    typeof accountRefresh.defaultAccountRefreshImplementation

// A custom data loader must define the matching refresh operation alongside it.
export type AccountDataVariantOverride = Pick<
  AccountDataVariant,
  "fetchAccountData" | "refreshAccountData"
> &
  Partial<Pick<AccountDataVariant, "fetchSupportCheckIn">>

/** Binds one usage-log dialect to both snapshot loading and health-state refresh. */
export function createLogQueryVariant(
  queryConfig: TodayLogQueryConfig,
): AccountDataVariantOverride {
  return {
    fetchAccountData: (request) =>
      accountData.fetchAccountData(request, queryConfig),
    refreshAccountData: (request) =>
      accountRefresh.refreshAccountData(request, queryConfig),
  }
}
