import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { createNewApiAccountBootstrap } from "~/services/apiAdapters/newApi/account/accountBootstrap"
import { createNewApiAccountCompletion } from "~/services/apiAdapters/newApi/account/accountCompletion"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/account/accountData"
import { createNewApiAccountLogin } from "~/services/apiAdapters/newApi/account/accountLogin"
import { createNewApiAccountRefresh } from "~/services/apiAdapters/newApi/account/accountRefresh"
import { createNewApiInviteLink } from "~/services/apiAdapters/newApi/account/inviteLink"
import { createNewApiRedemption } from "~/services/apiAdapters/newApi/account/redemption"
import { createNewApiSiteNotice } from "~/services/apiAdapters/newApi/announcements/siteNotice"
import { newApiSiteStructuredAnnouncements } from "~/services/apiAdapters/newApi/announcements/siteStructuredAnnouncements"
import { createNewApiAccountKeyResources } from "~/services/apiAdapters/newApi/keys/accountKeyResource"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/pricing/modelPricing"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { getNewApiVariantRegistration } from "./variantRegistration"

export const createNewApiCapabilities = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteTypeCapabilities => ({
  siteType,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
  site: {
    announcements: newApiSiteStructuredAnnouncements,
    notice: createNewApiSiteNotice(siteType),
  },
  account: {
    ...(getNewApiVariantRegistration(siteType).announcements
      ? { announcements: getNewApiVariantRegistration(siteType).announcements }
      : {}),
    login: createNewApiAccountLogin(siteType),
    data: createNewApiAccountData(siteType),
    bootstrap: createNewApiAccountBootstrap(siteType),
    completion: createNewApiAccountCompletion(siteType),
    inviteLink: createNewApiInviteLink(siteType),
    keyResourceManagement: createNewApiAccountKeyResources(siteType),
    refresh: createNewApiAccountRefresh(siteType),
    modelPricing: createNewApiModelPricing(siteType),
    redemption: createNewApiRedemption(),
  },
})

export { createNewApiAccountKeyResources } from "~/services/apiAdapters/newApi/keys/accountKeyResource"
