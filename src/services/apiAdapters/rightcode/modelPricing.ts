import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { MODEL_PRICING_RUNTIME_KEY_FALLBACKS } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchRightCodeEffectiveUpstreams } from "~/services/apiService/rightcode"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"

import { buildRightCodePricingResponse } from "./catalogMapping"

/**
 * Right Code prices every channel per account, so the snapshot is account
 * scoped and never needs a runtime key's secret to be revealed.
 */
export const rightCodeModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: MODEL_PRICING_RUNTIME_KEY_FALLBACKS.ACCOUNT_PRICING,
  fetchPricing: async (
    request: ApiServiceRequest,
  ): Promise<ModelCatalogSnapshot> =>
    buildRightCodePricingResponse(
      await fetchRightCodeEffectiveUpstreams(request),
    ),
}
