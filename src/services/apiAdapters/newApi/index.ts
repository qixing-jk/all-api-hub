import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { createNewApiAccountBootstrap } from "./accountBootstrap"
import { newApiAccountCompletion } from "./accountCompletion"
import { createNewApiAccountData } from "./accountData"
import { createNewApiAccountRefresh } from "./accountRefresh"
import { createNewApiKeyManagement } from "./keyManagement"
import { createNewApiModelPricing } from "./modelPricing"
import { newApiSiteNotice } from "./siteNotice"

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
  accountRefresh: createNewApiAccountRefresh(siteType),
  modelPricing: createNewApiModelPricing(siteType),
})
