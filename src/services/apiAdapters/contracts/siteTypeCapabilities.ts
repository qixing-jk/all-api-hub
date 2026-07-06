import type { AccountSiteType, ManagedSiteType } from "~/constants/siteType"
import type { AccountSiteBackendFamily } from "~/services/accountSiteDefinitions/contracts"

import type { AccountBootstrapCapability } from "./accountBootstrap"
import type { AccountCompletionCapability } from "./accountCompletion"
import type { AccountDataCapability } from "./accountData"
import type { AccountRefreshCapability } from "./accountRefresh"
import type { KeyManagementCapability } from "./keyManagement"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "./managedSiteCapabilities"
import type { ModelCatalogCapability } from "./modelCatalog"
import type { ModelPricingCapability } from "./modelPricing"
import type { RedemptionCapability } from "./redemption"
import type { ServiceCredentialCapability } from "./serviceCredential"
import type { SiteAnnouncementsCapability } from "./siteAnnouncements"
import type { SiteNoticeCapability } from "./siteNotice"
import type { TokenProvisioningCapability } from "./tokenProvisioning"

export type SiteType = AccountSiteType | ManagedSiteType

export type SiteBackendFamily = AccountSiteBackendFamily

export type SiteTypeCapabilities = {
  siteType: SiteType
  family?: SiteBackendFamily
  site?: {
    notice?: SiteNoticeCapability
  }
  account?: {
    announcements?: SiteAnnouncementsCapability
    modelCatalog?: ModelCatalogCapability
    modelPricing?: ModelPricingCapability
    data?: AccountDataCapability
    bootstrap?: AccountBootstrapCapability
    completion?: AccountCompletionCapability
    keyManagement?: KeyManagementCapability
    serviceCredential?: ServiceCredentialCapability
    tokenProvisioning?: TokenProvisioningCapability
    refresh?: AccountRefreshCapability
    redemption?: RedemptionCapability
  }
  managedSites?: {
    channels?: ManagedSiteChannelsCapability
    config?: ManagedSiteConfigCapability
    queries?: ManagedSiteQueriesCapability
    channelDrafts?: ManagedSiteChannelDraftsCapability
  }
}
