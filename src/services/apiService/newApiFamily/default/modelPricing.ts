import { ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS } from "~/constants/accountLogin"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
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
      return await newApiFamilyRequests.payload<unknown>(request, {
        endpoint: MODEL_PRICING_ENDPOINT,
        credentialRecovery: ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read,
      })
    } catch (error) {
      logger.error("获取模型定价失败", error)
      throw error
    }
  },
}
