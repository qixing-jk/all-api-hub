import type { AccountSiteType } from "~/constants/siteType"
import * as accountData from "~/services/apiService/newApiFamily/default/accountData"
import * as accountRefresh from "~/services/apiService/newApiFamily/default/accountRefresh"

import type { AccountDataVariant } from "./variantOperations/data"
import { getNewApiVariantRegistration } from "./variantRegistration"

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
