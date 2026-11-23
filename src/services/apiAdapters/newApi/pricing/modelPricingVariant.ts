import type { AccountSiteType } from "~/constants/siteType"
import { getCompatibleAccountVariant } from "~/services/apiAdapters/compatibleAccountVariant"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { defaultPricing } from "~/services/apiAdapters/newApi/variantOperations/pricing"

/** Transport and canonical admission are selected together by the site adapter. */
export function resolveNewApiModelPricingVariant(
  siteType: AccountSiteType,
): ModelPricingCapability["fetchPricing"] {
  return getCompatibleAccountVariant(siteType).pricing ?? defaultPricing
}
