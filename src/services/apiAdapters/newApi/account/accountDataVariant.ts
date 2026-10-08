import type { AccountSiteType } from "~/constants/siteType"
import type { AccountDataVariant } from "~/services/apiAdapters/newApi/variantOperations/data"
import { getNewApiVariantRegistration } from "~/services/apiAdapters/newApi/variantRegistration"
import * as accountData from "~/services/apiService/newApiFamily/default/accountData"
import * as accountRefresh from "~/services/apiService/newApiFamily/default/accountRefresh"

/** Resolves a paired account-data implementation for snapshot loading and refresh. */
export function resolveNewApiAccountDataVariant(
  siteType: AccountSiteType,
): AccountDataVariant {
  return {
    ...accountData.defaultAccountDataImplementation,
    ...accountRefresh.defaultAccountRefreshImplementation,
    ...getNewApiVariantRegistration(siteType).data,
  }
}
