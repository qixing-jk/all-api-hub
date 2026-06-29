import { fetchApiData } from "~/services/apiService/common/utils"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamilyRedemption")

interface RedemptionImplementation {
  redeemCode: (
    request: ApiServiceRequest,
    redemptionCode: string,
  ) => Promise<number>
}

export const defaultRedemptionImplementation: RedemptionImplementation = {
  redeemCode: async (request, redemptionCode) => {
    try {
      return await fetchApiData<number>(request, {
        endpoint: "/api/user/topup",
        options: {
          method: "POST",
          body: JSON.stringify({ key: redemptionCode }),
        },
      })
    } catch (error) {
      logger.error("兑换码充值失败", error)
      throw error
    }
  },
}
