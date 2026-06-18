import type {
  ApiServiceRequest,
  PricingResponse,
} from "~/services/apiService/common/type"

export type ModelPricingRequest = ApiServiceRequest

export type ModelPricingCapability = {
  fetchPricing(request: ModelPricingRequest): Promise<PricingResponse>
}
