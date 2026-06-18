import type { AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { getApiService } from "~/services/apiService"

/**
 * Create account model-pricing operations bound to the New API-family site type.
 */
export function createNewApiModelPricing(
  siteType: AccountSiteType,
): ModelPricingCapability {
  return {
    fetchPricing: (request) =>
      getApiService(siteType).fetchModelPricing(request),
  }
}
