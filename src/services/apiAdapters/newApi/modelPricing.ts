import type { AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { modelPricing } from "~/services/apiService/newApiFamily"

/**
 * Create account model-pricing operations bound to the New API-family site type.
 */
export function createNewApiModelPricing(
  siteType: AccountSiteType,
): ModelPricingCapability {
  const implementation = modelPricing.createModelPricingImplementation(siteType)

  return {
    fetchPricing: (request) => implementation.fetchModelPricing(request),
  }
}
