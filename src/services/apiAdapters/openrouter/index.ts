import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { openRouterAccountData } from "~/services/apiAdapters/openrouter/account/accountData"
import { openRouterAccountPersistence } from "~/services/apiAdapters/openrouter/account/accountPersistence"
import { openRouterAccountRefresh } from "~/services/apiAdapters/openrouter/account/accountRefresh"
import { openRouterAccountKeyResources } from "~/services/apiAdapters/openrouter/keys/accountKeyResource"
import { openRouterProviderModelCatalog } from "~/services/apiAdapters/openrouter/models/providerModelCatalog"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"

export const openRouterCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.OPENROUTER,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.OpenRouter,
  account: {
    data: openRouterAccountData,
    persistence: openRouterAccountPersistence,
    keyResourceManagement: openRouterAccountKeyResources,
    providerModelCatalog: openRouterProviderModelCatalog,
    refresh: openRouterAccountRefresh,
  },
}
