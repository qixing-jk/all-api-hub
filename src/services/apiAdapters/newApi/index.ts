import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { newApiAccountCompletion } from "./accountCompletion"
import { createNewApiAccountRefresh } from "./accountRefresh"
import { createNewApiKeyManagement } from "./keyManagement"
import { newApiSiteNotice } from "./siteNotice"

export const createNewApiAdapter = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteAdapter => ({
  siteType,
  family: "newApiFamily",
  siteNotice: newApiSiteNotice,
  accountCompletion: newApiAccountCompletion,
  keyManagement: createNewApiKeyManagement(siteType),
  accountRefresh: createNewApiAccountRefresh(siteType),
})
