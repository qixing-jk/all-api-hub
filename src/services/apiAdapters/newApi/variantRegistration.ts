import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/services/accountSiteDefinitions/contracts"
import type { AccountSiteTypeForAdapterFamily } from "~/services/accountSiteDefinitions/definitions"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"

import type { InviteLinkCapability } from "../contracts/inviteLink"
import type { ModelPricingCapability } from "../contracts/modelPricing"
import type { SiteNoticeCapability } from "../contracts/siteNotice"
import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import type { AccountBootstrapMetadataImplementation } from "./variantOperations/bootstrap"
import type { CredentialImplementation } from "./variantOperations/credentials"
import type { AccountDataVariantOverride } from "./variantOperations/data"
import type { NewApiKeyVariantOverride } from "./variantOperations/key"
import type { DynamicAccountRouteResolver } from "./variantOperations/routes"
import { anyrouterVariant } from "./variants/anyrouter"
import { apiyiVariant } from "./variants/apiyi"
import { compatibleVariant } from "./variants/compatible"
import { doneHubVariant } from "./variants/doneHub"
import { laozhangVariant } from "./variants/laozhang"
import { modelflareVariant } from "./variants/modelflare"
import { newApiVariant } from "./variants/newApi"
import { oneApiVariant } from "./variants/oneApi"
import { oneHubVariant } from "./variants/oneHub"
import { rixApiVariant } from "./variants/rixApi"
import { vApiVariant } from "./variants/vApi"
import { veloeraVariant } from "./variants/veloera"
import { wongGongyiVariant } from "./variants/wongGongyi"

/** A site owns its capability composition; each operation retains its own implementation. */
export type NewApiVariantRegistration = {
  credentials?: Partial<CredentialImplementation>
  data?: AccountDataVariantOverride
  key?: NewApiKeyVariantOverride
  pricing?: ModelPricingCapability["fetchPricing"]
  resolveRoutePath?: DynamicAccountRouteResolver
  bootstrap?: Partial<AccountBootstrapMetadataImplementation>
  inviteLink?: InviteLinkCapability
  notice?: SiteNoticeCapability
  announcements?: NonNullable<SiteTypeCapabilities["account"]>["announcements"]
}
export const newApiVariantRegistrations = {
  [SITE_TYPES.APIYI]: apiyiVariant,
  [SITE_TYPES.ANYROUTER]: anyrouterVariant,
  [SITE_TYPES.MODELFLARE]: modelflareVariant,
  [SITE_TYPES.LAOZHANG]: laozhangVariant,
  [SITE_TYPES.ONE_API]: oneApiVariant,
  [SITE_TYPES.VELOERA]: veloeraVariant,
  [SITE_TYPES.ONE_HUB]: oneHubVariant,
  [SITE_TYPES.DONE_HUB]: doneHubVariant,
  [SITE_TYPES.V_API]: vApiVariant,
  [SITE_TYPES.VO_API]: compatibleVariant,
  [SITE_TYPES.SUPER_API]: compatibleVariant,
  [SITE_TYPES.RIX_API]: rixApiVariant,
  [SITE_TYPES.NEO_API]: compatibleVariant,
  [SITE_TYPES.WONG_GONGYI]: wongGongyiVariant,
  [SITE_TYPES.UNKNOWN]: compatibleVariant,
  [SITE_TYPES.NEW_API]: newApiVariant,
} satisfies Record<
  AccountSiteTypeForAdapterFamily<
    typeof ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
  >,
  NewApiVariantRegistration
>
const defaultRegistration: NewApiVariantRegistration = {}
/** Resolves only registered differences; family defaults stay owned by capability modules. */
export function getNewApiVariantRegistration(
  siteType?: AccountSiteType,
): NewApiVariantRegistration {
  if (!siteType) return defaultRegistration
  if (Object.hasOwn(newApiVariantRegistrations, siteType))
    return newApiVariantRegistrations[
      siteType as keyof typeof newApiVariantRegistrations
    ]
  if (
    getAccountSiteDefinition(siteType)?.adapterFamily ===
    ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
  )
    throw new Error(`New API family variant is not registered for ${siteType}`)
  return defaultRegistration
}
