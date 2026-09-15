import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { sub2ApiAccountBootstrap } from "~/services/apiAdapters/sub2api/accountBootstrap"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { sub2ApiAccountCompletion } from "./accountCompletion"
import { sub2ApiAccountData } from "./accountData"
import { sub2ApiAccountKeyResources } from "./accountKeyResource"
import { sub2ApiAccountRefresh } from "./accountRefresh"
import { sub2ApiInviteLink } from "./inviteLink"
import { sub2ApiModelCatalog } from "./modelCatalog"
import { sub2ApiSiteAnnouncements } from "./siteAnnouncements"

export const sub2ApiCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.SUB2API,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
  account: {
    announcements: sub2ApiSiteAnnouncements,
    modelCatalog: sub2ApiModelCatalog,
    data: sub2ApiAccountData,
    bootstrap: sub2ApiAccountBootstrap,
    completion: sub2ApiAccountCompletion,
    inviteLink: sub2ApiInviteLink,
    keyResourceManagement: sub2ApiAccountKeyResources,
    refresh: sub2ApiAccountRefresh,
  },
}
