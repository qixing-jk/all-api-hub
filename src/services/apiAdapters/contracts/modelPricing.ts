import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { PricingResponse } from "~/services/modelList/pricingModel"

export type ModelPricingRequest = ApiServiceRequest

export type ModelPricingCapability = {
  fetchPricing(request: ModelPricingRequest): Promise<PricingResponse>
}
