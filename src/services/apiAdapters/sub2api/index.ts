import { SITE_TYPES } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { sub2ApiAccountBootstrap } from "./accountBootstrap"
import { sub2ApiAccountCompletion } from "./accountCompletion"
import { sub2ApiAccountData } from "./accountData"
import { sub2ApiAccountRefresh } from "./accountRefresh"
import { sub2ApiKeyManagement } from "./keyManagement"
import { sub2ApiModelCatalog } from "./modelCatalog"
import { sub2ApiSiteAnnouncements } from "./siteAnnouncements"

export const sub2ApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api",
  siteAnnouncements: sub2ApiSiteAnnouncements,
  modelCatalog: sub2ApiModelCatalog,
  accountData: sub2ApiAccountData,
  accountBootstrap: sub2ApiAccountBootstrap,
  accountCompletion: sub2ApiAccountCompletion,
  keyManagement: sub2ApiKeyManagement,
  accountRefresh: sub2ApiAccountRefresh,
}
