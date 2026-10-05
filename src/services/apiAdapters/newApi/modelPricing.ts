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

import { applyFamilyGroupEvidence } from "./groupEvidence"
import {
  fetchRixApiModelPricing,
  normalizeRixApiModelPricingResponse,
} from "./rixApiModelPricing"

/**
 * Create account model-pricing operations bound to the New API-family site type.
 */
export function createNewApiModelPricing(
  siteType: AccountSiteType,
): ModelPricingCapability {
  if (siteType === SITE_TYPES.ONE_HUB || siteType === SITE_TYPES.DONE_HUB) {
    return {
      fetchPricing: async (request) =>
        applyFamilyGroupEvidence(
          await oneHub.fetchModelPricing(
            request,
            siteType === SITE_TYPES.DONE_HUB,
          ),
        ),
    }
  }

  // LaoZhang v31.1.5 shares APIyi's pricing envelope and conditional-rate
  // schema, including sibling group/vendor facts: https://api2.laozhang.ai/api/pricing
  if (siteType === SITE_TYPES.APIYI || siteType === SITE_TYPES.LAOZHANG) {
    return {
      fetchPricing: async (request) => {
        const { pricing, status } = await apiyi.fetchModelPricing(request)
        return applyFamilyGroupEvidence(
          normalizeApiYiModelPricingResponse(pricing, status),
        )
      },
    }
  }

  const normalizePricingResponse =
    siteType === SITE_TYPES.V_API
      ? normalizeVApiModelPricingResponse
      : siteType === SITE_TYPES.RIX_API
        ? normalizeRixApiModelPricingResponse
        : normalizeNewApiModelPricingResponse
  const fetchModelPricing =
    siteType === SITE_TYPES.RIX_API
      ? fetchRixApiModelPricing
      : modelPricing.defaultModelPricingImplementation.fetchModelPricing

  return {
    fetchPricing: async (request) =>
      normalizePricingResponse(await fetchModelPricing(request)),
  }
}
