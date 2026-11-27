import type {
  ModelPricingCapability,
  ModelPricingRequest,
} from "~/services/apiAdapters/contracts/modelPricing"
import { normalizeNewApiModelPricingResponse } from "~/services/apiAdapters/newApi/pricing/modelPricingDto"
import * as modelPricing from "~/services/apiService/newApiFamily/default/modelPricing"
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
