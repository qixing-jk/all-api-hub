import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/services/accountSiteDefinitions/contracts"
import type { AccountSiteTypeForAdapterFamily } from "~/services/accountSiteDefinitions/definitions"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"

import type { CompatibleAccountVariant } from "../compatibleAccountVariantContract"
import { anyrouterVariant } from "./variants/anyrouter"
import { compatibleVariant } from "./variants/compatible"
import { doneHubVariant } from "./variants/doneHub"
import { modelflareVariant } from "./variants/modelflare"
import { newApiVariant } from "./variants/newApi"
import { oneApiVariant } from "./variants/oneApi"
import { oneHubVariant } from "./variants/oneHub"
import { rixApiVariant } from "./variants/rixApi"
import { vApiVariant } from "./variants/vApi"
import { veloeraVariant } from "./variants/veloera"
import { wongGongyiVariant } from "./variants/wongGongyi"

export const newApiVariantRegistrations = {
  [SITE_TYPES.ANYROUTER]: anyrouterVariant,
  [SITE_TYPES.MODELFLARE]: modelflareVariant,
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
  CompatibleAccountVariant
>
const defaultRegistration: CompatibleAccountVariant = {}
/** Resolves only registered differences; family defaults stay owned by capability modules. */
export function getNewApiVariantRegistration(
  siteType?: AccountSiteType,
): CompatibleAccountVariant {
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
