import type { AccountSiteType } from "~/constants/siteType"

import type { AccountSiteModelListProfile } from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

/**
 * Resolves Model List source-account policy for an account site type.
 */
export function getAccountSiteModelListProfile(
  siteType: AccountSiteType,
): AccountSiteModelListProfile {
  return { ...getAccountSiteProductProfile(siteType).modelList }
}
