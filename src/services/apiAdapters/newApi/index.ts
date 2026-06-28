import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { createNewApiAccountBootstrap } from "./accountBootstrap"
import { newApiAccountCompletion } from "./accountCompletion"
import { createNewApiAccountData } from "./accountData"
import { createNewApiAccountRefresh } from "./accountRefresh"
import { createNewApiKeyManagement } from "./keyManagement"
import { createNewApiModelPricing } from "./modelPricing"
import { createNewApiRedemption } from "./redemption"
import { newApiSiteNotice } from "./siteNotice"
import { createNewApiTokenProvisioning } from "./tokenProvisioning"

export const createNewApiAdapter = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteAdapter => ({
  siteType,
  family: "newApiFamily",
  siteNotice: newApiSiteNotice,
  accountData: createNewApiAccountData(siteType),
  accountBootstrap: createNewApiAccountBootstrap(siteType),
  accountCompletion: newApiAccountCompletion,
  keyManagement: createNewApiKeyManagement(siteType),
  tokenProvisioning: createNewApiTokenProvisioning(),
  accountRefresh: createNewApiAccountRefresh(siteType),
  modelPricing: createNewApiModelPricing(siteType),
  redemption: createNewApiRedemption(),
})
