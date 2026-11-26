import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { createCompatibleAccountCapabilities } from "~/services/apiAdapters/compatibleCapabilities"
import { createNewApiAccountLogin } from "~/services/apiAdapters/newApi/account/accountLogin"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"

/** Adds New API family identity and login to the shared compatible operations. */
export function createNewApiCapabilities(
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteTypeCapabilities {
  const compatible = createCompatibleAccountCapabilities(siteType)
  return {
    siteType,
    family: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    ...compatible,
    account: {
      ...compatible.account,
      login: createNewApiAccountLogin(siteType),
    },
  }
}

export { createNewApiAccountKeyResources } from "~/services/apiAdapters/newApi/keys/accountKeyResource"
