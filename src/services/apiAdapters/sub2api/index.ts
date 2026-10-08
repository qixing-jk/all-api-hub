import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { sub2ApiAccountBootstrap } from "~/services/apiAdapters/sub2api/account/accountBootstrap"
import { sub2ApiAccountCompletion } from "~/services/apiAdapters/sub2api/account/accountCompletion"
import { sub2ApiAccountData } from "~/services/apiAdapters/sub2api/account/accountData"
import { sub2ApiAccountRefresh } from "~/services/apiAdapters/sub2api/account/accountRefresh"
import { sub2ApiInviteLink } from "~/services/apiAdapters/sub2api/account/inviteLink"
import { sub2ApiSiteAnnouncements } from "~/services/apiAdapters/sub2api/account/siteAnnouncements"
import { sub2ApiAccountLogin } from "~/services/apiAdapters/sub2api/auth/accountLogin"
import { sub2ApiAccountKeyResources } from "~/services/apiAdapters/sub2api/keys/accountKeyResource"
import { sub2ApiModelCatalog } from "~/services/apiAdapters/sub2api/models/modelCatalog"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"

export const sub2ApiCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.SUB2API,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
  account: {
    login: sub2ApiAccountLogin,
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
