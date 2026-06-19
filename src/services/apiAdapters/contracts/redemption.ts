import type { ApiServiceRequest } from "~/services/apiService/common/type"

export type RedeemCodeRequest = {
  request: ApiServiceRequest
  code: string
}

export type RedemptionCapability = {
  redeem(request: RedeemCodeRequest): Promise<unknown>
}
