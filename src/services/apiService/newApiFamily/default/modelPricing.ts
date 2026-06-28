import { fetchApi } from "~/services/apiService/common/utils"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import { createLogger } from "~/utils/core/logger"

const MODEL_PRICING_ENDPOINT = "/api/pricing"
const logger = createLogger("NewApiFamilyModelPricing")

interface ModelPricingImplementation {
  fetchModelPricing: (request: ApiServiceRequest) => Promise<PricingResponse>
}

export const defaultModelPricingImplementation: ModelPricingImplementation = {
  fetchModelPricing: async (request) => {
    try {
      return await fetchApi<PricingResponse>(
        request,
        { endpoint: MODEL_PRICING_ENDPOINT },
        true,
      )
    } catch (error) {
      logger.error("获取模型定价失败", error)
      throw error
    }
  },
}

export const fetchModelPricing =
  defaultModelPricingImplementation.fetchModelPricing
