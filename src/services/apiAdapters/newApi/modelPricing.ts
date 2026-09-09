import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { normalizeApiYiModelPricingResponse } from "~/services/apiAdapters/newApi/apiyiModelPricing"
import {
  normalizeNewApiModelPricingResponse,
  normalizeVApiModelPricingResponse,
} from "~/services/apiAdapters/newApi/modelPricingDto"
import * as modelPricing from "~/services/apiService/newApiFamily/default/modelPricing"
import * as apiyi from "~/services/apiService/newApiFamily/variants/apiyi"
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

  if (siteType === SITE_TYPES.APIYI) {
    return {
      fetchPricing: async (request) => {
        const { pricing, status } = await apiyi.fetchModelPricing(request)
        return normalizeApiYiModelPricingResponse(pricing, status)
      },
    }
  }

  const normalizePricingResponse =
    siteType === SITE_TYPES.V_API
      ? normalizeVApiModelPricingResponse
      : normalizeNewApiModelPricingResponse
  const fetchModelPricing =
    modelPricing.defaultModelPricingImplementation.fetchModelPricing

  return {
    fetchPricing: async (request) =>
      normalizePricingResponse(await fetchModelPricing(request)),
  }
}
