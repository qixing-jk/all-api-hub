import type { AccountSiteType } from "~/constants/siteType"

import type { AccountBootstrapCapability } from "./accountBootstrap"
import type { AccountCompletionCapability } from "./accountCompletion"
import type { AccountDataCapability } from "./accountData"
import type { AccountRefreshCapability } from "./accountRefresh"
import type { KeyManagementCapability } from "./keyManagement"
import type { ModelCatalogCapability } from "./modelCatalog"
import type { ModelPricingCapability } from "./modelPricing"
import type { RedemptionCapability } from "./redemption"
import type { SiteAnnouncementsCapability } from "./siteAnnouncements"
import type { SiteNoticeCapability } from "./siteNotice"

export type SiteBackendFamily = "newApiFamily" | "sub2api"

export type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  modelPricing?: ModelPricingCapability
  accountData?: AccountDataCapability
  accountBootstrap?: AccountBootstrapCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
  accountRefresh?: AccountRefreshCapability
  redemption?: RedemptionCapability
}
