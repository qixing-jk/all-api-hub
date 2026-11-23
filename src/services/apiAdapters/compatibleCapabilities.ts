import type { AccountSiteType } from "~/constants/siteType"
import { createNewApiAccountBootstrap } from "~/services/apiAdapters/newApi/account/accountBootstrap"
import { createNewApiAccountCompletion } from "~/services/apiAdapters/newApi/account/accountCompletion"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/account/accountData"
import { createNewApiAccountRefresh } from "~/services/apiAdapters/newApi/account/accountRefresh"
import { createNewApiInviteLink } from "~/services/apiAdapters/newApi/account/inviteLink"
import { createNewApiRedemption } from "~/services/apiAdapters/newApi/account/redemption"
import { createNewApiSiteNotice } from "~/services/apiAdapters/newApi/announcements/siteNotice"
import { newApiSiteStructuredAnnouncements } from "~/services/apiAdapters/newApi/announcements/siteStructuredAnnouncements"
import { createNewApiAccountKeyResources } from "~/services/apiAdapters/newApi/keys/accountKeyResource"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/pricing/modelPricing"
import { newApiSiteEndpointMetadata } from "~/services/apiAdapters/newApi/siteEndpointMetadata"

import { getCompatibleAccountVariant } from "./compatibleAccountVariant"
import type { SiteTypeCapabilities } from "./contracts/siteTypeCapabilities"

/** Shares proven compatible operations; family wrappers own identity and login policy. */
export function createCompatibleAccountCapabilities(siteType: AccountSiteType) {
  const announcements = getCompatibleAccountVariant(siteType).announcements
  return {
    site: {
      endpointMetadata: newApiSiteEndpointMetadata,
      announcements: newApiSiteStructuredAnnouncements,
      notice: createNewApiSiteNotice(siteType),
    },
    account: {
      bootstrap: createNewApiAccountBootstrap(siteType),
      completion: createNewApiAccountCompletion(siteType),
      data: createNewApiAccountData(siteType),
      refresh: createNewApiAccountRefresh(siteType),
      keyResourceManagement: createNewApiAccountKeyResources(siteType),
      modelPricing: createNewApiModelPricing(siteType),
      inviteLink: createNewApiInviteLink(siteType),
      redemption: createNewApiRedemption(),
      ...(announcements && { announcements }),
    },
  } satisfies Pick<SiteTypeCapabilities, "site" | "account">
}
