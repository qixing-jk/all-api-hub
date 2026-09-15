import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { createNewApiAccountBootstrap } from "./accountBootstrap"
import { createNewApiAccountCompletion } from "./accountCompletion"
import { createNewApiAccountData } from "./accountData"
import { createNewApiAccountKeyResources } from "./accountKeyResource"
import { createNewApiAccountRefresh } from "./accountRefresh"
import { createNewApiInviteLink } from "./inviteLink"
import { createNewApiModelPricing } from "./modelPricing"
import { createNewApiRedemption } from "./redemption"
import { newApiSiteNotice } from "./siteNotice"
import { newApiSiteStructuredAnnouncements } from "./siteStructuredAnnouncements"

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
    completion: createNewApiAccountCompletion(siteType),
    inviteLink: createNewApiInviteLink(),
    keyResourceManagement: createNewApiAccountKeyResources(siteType),
    refresh: createNewApiAccountRefresh(siteType),
    modelPricing: createNewApiModelPricing(siteType),
    redemption: createNewApiRedemption(),
  },
})

export { createNewApiAccountKeyResources } from "./accountKeyResource"
