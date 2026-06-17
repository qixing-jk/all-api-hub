import type { AccountSiteType } from "~/constants/siteType"

import type { ModelCatalogCapability } from "./modelCatalog"
import type { SiteAnnouncementsCapability } from "./siteAnnouncements"
import type { SiteNoticeCapability } from "./siteNotice"

export type SiteBackendFamily = "newApiFamily" | "sub2api"

export type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
}
