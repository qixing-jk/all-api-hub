import type { AccountSiteType } from "~/constants/siteType"
import { getCompatibleAccountVariant } from "~/services/apiAdapters/compatibleAccountVariant"
import type { AccountDataVariant } from "~/services/apiAdapters/newApi/variantOperations/data"
import * as accountData from "~/services/apiService/newApiFamily/default/accountData"
import * as accountRefresh from "~/services/apiService/newApiFamily/default/accountRefresh"

/** Resolves a paired account-data implementation for snapshot loading and refresh. */
export function resolveNewApiAccountDataVariant(
  siteType: AccountSiteType,
): AccountDataVariant {
  return {
    ...accountData.defaultAccountDataImplementation,
    ...accountRefresh.defaultAccountRefreshImplementation,
    ...getCompatibleAccountVariant(siteType).data,
  }
}
