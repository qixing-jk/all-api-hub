import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type RedeemCodeRequest = {
  request: ApiServiceRequest
  code: string
}

export type RedemptionCapability = {
  redeem(request: RedeemCodeRequest): Promise<unknown>
}
