import type { AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { defaultPricing } from "~/services/apiAdapters/newApi/variantOperations/pricing"
import { getNewApiVariantRegistration } from "~/services/apiAdapters/newApi/variantRegistration"

/** Transport and canonical admission are selected together by the site adapter. */
export function resolveNewApiModelPricingVariant(
  siteType: AccountSiteType,
): ModelPricingCapability["fetchPricing"] {
  return getNewApiVariantRegistration(siteType).pricing ?? defaultPricing
}
