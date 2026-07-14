import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"

const MODEL_PRICING_ENDPOINT = "/api/pricing"
const logger = createLogger("NewApiFamilyModelPricing")

interface ModelPricingImplementation {
  fetchModelPricing: (request: ApiServiceRequest) => Promise<unknown>
}

export const defaultModelPricingImplementation: ModelPricingImplementation = {
  fetchModelPricing: async (request) => {
    try {
      return await fetchApi<unknown>(
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
