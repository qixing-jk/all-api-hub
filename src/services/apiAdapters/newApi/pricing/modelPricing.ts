import type { AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { resolveNewApiModelPricingVariant } from "~/services/apiAdapters/newApi/pricing/modelPricingVariant"

/**
 * Create account model-pricing operations bound to the New API-family site type.
 */
export function createNewApiModelPricing(
  siteType: AccountSiteType,
): ModelPricingCapability {
  return {
    fetchPricing: resolveNewApiModelPricingVariant(siteType),
  }
}
