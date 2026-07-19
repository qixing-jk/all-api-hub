import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { normalizeNewApiModelPricingResponse } from "~/services/apiAdapters/newApi/modelPricingDto"
import * as modelPricing from "~/services/apiService/newApiFamily/default/modelPricing"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"

/**
 * Create account model-pricing operations bound to the New API-family site type.
 */
export function createNewApiModelPricing(
  siteType: AccountSiteType,
): ModelPricingCapability {
  if (siteType === SITE_TYPES.ONE_HUB || siteType === SITE_TYPES.DONE_HUB) {
    return {
      fetchPricing: (request) => oneHub.fetchModelPricing(request),
    }
  }

  return {
    fetchPricing: async (request) =>
      normalizeNewApiModelPricingResponse(
        await modelPricing.defaultModelPricingImplementation.fetchModelPricing(
          request,
        ),
      ),
  }
}
