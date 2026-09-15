import type { AccountSiteType, ManagedSiteType } from "~/constants/siteType"
import type { AccountSiteBackendFamily } from "~/services/accountSiteDefinitions/contracts"

import type { AccountBootstrapCapability } from "./accountBootstrap"
import type { AccountCompletionCapability } from "./accountCompletion"
import type { AccountDataCapability } from "./accountData"
import type { AccountKeyResourceCapability } from "./accountKeyResource"
import type { AccountPersistenceCapability } from "./accountPersistence"
import type { AccountRefreshCapability } from "./accountRefresh"
import type { InviteLinkCapability } from "./inviteLink"
import type { ManagedSiteCapabilities } from "./managedSiteCapabilities"
import type { ModelCatalogCapability } from "./modelCatalog"
import type { ModelPricingCapability } from "./modelPricing"
import type { ProviderModelCatalogCapability } from "./providerModelCatalog"
import type { RedemptionCapability } from "./redemption"
import type { ServiceCredentialCapability } from "./serviceCredential"
import type { SiteAnnouncementsCapability } from "./siteAnnouncements"
import type { SiteNoticeCapability } from "./siteNotice"
import type { SiteStructuredAnnouncementsCapability } from "./siteStructuredAnnouncements"

export type SiteType = AccountSiteType | ManagedSiteType

export type SiteBackendFamily = AccountSiteBackendFamily

export type SiteTypeCapabilities = {
  siteType: SiteType
  family?: SiteBackendFamily
  site?: {
    announcements?: SiteStructuredAnnouncementsCapability
    notice?: SiteNoticeCapability
  }
  account?: {
    announcements?: SiteAnnouncementsCapability
    modelCatalog?: ModelCatalogCapability
    providerModelCatalog?: ProviderModelCatalogCapability
    modelPricing?: ModelPricingCapability
    data?: AccountDataCapability
    persistence?: AccountPersistenceCapability
    bootstrap?: AccountBootstrapCapability
    completion?: AccountCompletionCapability
    inviteLink?: InviteLinkCapability
    /** Native resource surface wired into the ordinary Key Management UI. */
    keyResourceManagement?: AccountKeyResourceCapability
    serviceCredential?: ServiceCredentialCapability
    refresh?: AccountRefreshCapability
    redemption?: RedemptionCapability
  }
  managedSites?: Partial<ManagedSiteCapabilities>
}

export type AccountSiteCapabilities = NonNullable<
  SiteTypeCapabilities["account"]
>
