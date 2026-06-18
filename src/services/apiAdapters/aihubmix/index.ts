import { SITE_TYPES } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { aihubmixAccountCompletion } from "./accountCompletion"
import { aihubmixAccountRefresh } from "./accountRefresh"
import { aihubmixKeyManagement } from "./keyManagement"
import { aihubmixModelPricing } from "./modelPricing"

export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountCompletion: aihubmixAccountCompletion,
  keyManagement: aihubmixKeyManagement,
  accountRefresh: aihubmixAccountRefresh,
  modelPricing: aihubmixModelPricing,
}
