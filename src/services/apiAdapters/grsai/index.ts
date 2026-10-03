import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { grsaiAccountBootstrap } from "./accountBootstrap"
import { grsaiAccountCompletion } from "./accountCompletion"
import { grsaiAccountData } from "./accountData"
import { grsaiAccountKeyResources } from "./accountKeyResource"
import { grsaiAccountRefresh } from "./accountRefresh"
import { grsaiModelPricing } from "./modelPricing"

export const grsaiCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.GRSAI,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Grsai,
  account: {
    data: grsaiAccountData,
    bootstrap: grsaiAccountBootstrap,
    completion: grsaiAccountCompletion,
    keyResourceManagement: grsaiAccountKeyResources,
    refresh: grsaiAccountRefresh,
    modelPricing: grsaiModelPricing,
  },
}
