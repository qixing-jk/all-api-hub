import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { createNewApiAccountBootstrap } from "./accountBootstrap"
import { newApiAccountCompletion } from "./accountCompletion"
import { createNewApiAccountData } from "./accountData"
import { createNewApiAccountRefresh } from "./accountRefresh"
import { createNewApiKeyManagement } from "./keyManagement"
import { createNewApiModelPricing } from "./modelPricing"
import { createNewApiRedemption } from "./redemption"
import { newApiSiteNotice } from "./siteNotice"
import { newApiSiteStructuredAnnouncements } from "./siteStructuredAnnouncements"
import { createNewApiTokenProvisioning } from "./tokenProvisioning"

export const createNewApiCapabilities = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteTypeCapabilities => ({
  siteType,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
  site: {
    announcements: newApiSiteStructuredAnnouncements,
    notice: newApiSiteNotice,
  },
  account: {
    data: createNewApiAccountData(siteType),
    bootstrap: createNewApiAccountBootstrap(siteType),
    completion: newApiAccountCompletion,
    keyManagement: createNewApiKeyManagement(siteType),
    tokenProvisioning: createNewApiTokenProvisioning(),
    refresh: createNewApiAccountRefresh(siteType),
    modelPricing: createNewApiModelPricing(siteType),
    redemption: createNewApiRedemption(),
  },
})
