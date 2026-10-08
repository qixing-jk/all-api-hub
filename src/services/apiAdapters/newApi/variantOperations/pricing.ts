import type {
  ModelPricingCapability,
  ModelPricingRequest,
} from "~/services/apiAdapters/contracts/modelPricing"
import { applyFamilyGroupEvidence } from "~/services/apiAdapters/newApi/account/groupEvidence"
import { normalizeApiYiModelPricingResponse } from "~/services/apiAdapters/newApi/pricing/apiyiModelPricing"
import { normalizeNewApiModelPricingResponse } from "~/services/apiAdapters/newApi/pricing/modelPricingDto"
import * as modelPricing from "~/services/apiService/newApiFamily/default/modelPricing"
import * as apiyi from "~/services/apiService/newApiFamily/variants/apiyi"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"

type FetchPricing = ModelPricingCapability["fetchPricing"]

/** Binds a native transport to the parser that admits its canonical catalog. */
export function bindModelPricing<T>(
  fetchNative: (request: ModelPricingRequest) => Promise<T>,
  normalize: (response: T) => ModelCatalogSnapshot,
): FetchPricing {
  return async (request) => normalize(await fetchNative(request))
}

export const fetchDefaultModelPricing =
  modelPricing.defaultModelPricingImplementation.fetchModelPricing

export const defaultPricing = bindModelPricing(
  fetchDefaultModelPricing,
  normalizeNewApiModelPricingResponse,
)

// LaoZhang v31.1.5 shares APIyi's pricing envelope and conditional-rate
// schema, including sibling group/vendor facts: https://api2.laozhang.ai/api/pricing
export const apiyiPricing = bindModelPricing(
  apiyi.fetchModelPricing,
  ({ pricing, status }) =>
    applyFamilyGroupEvidence(
      normalizeApiYiModelPricingResponse(pricing, status),
    ),
)
