import type { InviteLinkCapability } from "./contracts/inviteLink"
import type { ModelPricingCapability } from "./contracts/modelPricing"
import type { SiteAnnouncementsCapability } from "./contracts/siteAnnouncements"
import type { SiteNoticeCapability } from "./contracts/siteNotice"
import type { AccountBootstrapMetadataImplementation } from "./newApi/variantOperations/bootstrap"
import type { CredentialImplementation } from "./newApi/variantOperations/credentials"
import type { AccountDataVariantOverride } from "./newApi/variantOperations/data"
import type { NewApiKeyVariantOverride } from "./newApi/variantOperations/key"
import type { DynamicAccountRouteResolver } from "./newApi/variantOperations/routes"

/** A site owns its capability composition; each operation retains its own implementation. */
export type CompatibleAccountVariant = {
  credentials?: Partial<CredentialImplementation>
  data?: AccountDataVariantOverride
  key?: NewApiKeyVariantOverride
  pricing?: ModelPricingCapability["fetchPricing"]
  resolveRoutePath?: DynamicAccountRouteResolver
  bootstrap?: Partial<AccountBootstrapMetadataImplementation>
  inviteLink?: InviteLinkCapability
  notice?: SiteNoticeCapability
  announcements?: SiteAnnouncementsCapability
}
