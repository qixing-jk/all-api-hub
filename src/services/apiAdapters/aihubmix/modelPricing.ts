import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchModelPricing } from "~/services/apiService/aihubmix"

export const aihubmixModelPricing: ModelPricingCapability = {
  fetchPricing: (request) => fetchModelPricing(request),
}
