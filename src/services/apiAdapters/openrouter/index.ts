import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { openRouterAccountData } from "./accountData"
import { openRouterAccountKeyResources } from "./accountKeyResource"
import { openRouterAccountRefresh } from "./accountRefresh"

export const openRouterCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.OPENROUTER,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.OpenRouter,
  account: {
    data: openRouterAccountData,
    keyResources: openRouterAccountKeyResources,
    refresh: openRouterAccountRefresh,
  },
}
