import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { MODEL_PRICING_RUNTIME_KEY_FALLBACKS } from "~/services/apiAdapters/contracts/modelPricing"
import {
  fetchModelPricing,
  invalidateAIHubMixPublicCatalogs,
} from "~/services/apiService/aihubmix"

export const aihubmixModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: MODEL_PRICING_RUNTIME_KEY_FALLBACKS.ACCOUNT_PRICING,
  fetchPricing: (request) => fetchModelPricing(request),
  invalidateCache: invalidateAIHubMixPublicCatalogs,
}
