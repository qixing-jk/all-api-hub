import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { MODEL_PRICING_RUNTIME_KEY_FALLBACKS } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchGrsaiModels } from "~/services/apiService/grsai"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"

import { buildGrsaiPricingResponse } from "./catalogMapping"

/**
 * Grsai prices every model per call in the deployment's own credits, and the
 * console catalog is account scoped, so the snapshot never needs a runtime
 * key's secret to be revealed.
 */
export const grsaiModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: MODEL_PRICING_RUNTIME_KEY_FALLBACKS.ACCOUNT_PRICING,
  fetchPricing: async (
    request: ApiServiceRequest,
  ): Promise<ModelCatalogSnapshot> =>
    buildGrsaiPricingResponse(await fetchGrsaiModels(request)),
}
