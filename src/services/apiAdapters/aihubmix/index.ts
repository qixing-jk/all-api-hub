import { SITE_TYPES } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { aihubmixAccountBootstrap } from "./accountBootstrap"
import { aihubmixAccountCompletion } from "./accountCompletion"
import { aihubmixAccountData } from "./accountData"
import { aihubmixAccountRefresh } from "./accountRefresh"
import { aihubmixKeyManagement } from "./keyManagement"
import { aihubmixModelPricing } from "./modelPricing"
import { aihubmixTokenProvisioning } from "./tokenProvisioning"

export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountData: aihubmixAccountData,
  accountBootstrap: aihubmixAccountBootstrap,
  accountCompletion: aihubmixAccountCompletion,
  keyManagement: aihubmixKeyManagement,
  tokenProvisioning: aihubmixTokenProvisioning,
  accountRefresh: aihubmixAccountRefresh,
  modelPricing: aihubmixModelPricing,
}
