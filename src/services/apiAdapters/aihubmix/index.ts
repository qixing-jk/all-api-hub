import { SITE_TYPES } from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { aihubmixAccountBootstrap } from "./accountBootstrap"
import { aihubmixAccountCompletion } from "./accountCompletion"
import { aihubmixAccountData } from "./accountData"
import { aihubmixAccountRefresh } from "./accountRefresh"
import { aihubmixKeyManagement } from "./keyManagement"
import { aihubmixModelPricing } from "./modelPricing"
import { aihubmixTokenProvisioning } from "./tokenProvisioning"

export const aihubmixCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.AIHUBMIX,
  account: {
    data: aihubmixAccountData,
    bootstrap: aihubmixAccountBootstrap,
    completion: aihubmixAccountCompletion,
    keyManagement: aihubmixKeyManagement,
    tokenProvisioning: aihubmixTokenProvisioning,
    refresh: aihubmixAccountRefresh,
    modelPricing: aihubmixModelPricing,
  },
}
