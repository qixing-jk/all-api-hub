import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/constants/siteType"
import type { AccountSiteType } from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { kimiOpenPlatformAccountBootstrap } from "./accountBootstrap"
import { kimiOpenPlatformAccountCompletion } from "./accountCompletion"
import { kimiOpenPlatformAccountData } from "./accountData"
import { createKimiOpenPlatformKeyResources } from "./accountKeyResource"
import { kimiOpenPlatformAccountRefresh } from "./accountRefresh"
import { createKimiOpenPlatformProviderModelCatalog } from "./providerModelCatalog"

/** Both Kimi Open Platform site types share this capability set. */
export function createKimiOpenPlatformCapabilities(
  siteType: AccountSiteType,
): SiteTypeCapabilities {
  return {
    siteType,
    family: ACCOUNT_SITE_ADAPTER_FAMILIES.KimiOpenPlatform,
    account: {
      data: kimiOpenPlatformAccountData,
      bootstrap: kimiOpenPlatformAccountBootstrap,
      completion: kimiOpenPlatformAccountCompletion,
      keyResourceManagement: createKimiOpenPlatformKeyResources(siteType),
      refresh: kimiOpenPlatformAccountRefresh,
      providerModelCatalog:
        createKimiOpenPlatformProviderModelCatalog(siteType),
    },
  }
}
