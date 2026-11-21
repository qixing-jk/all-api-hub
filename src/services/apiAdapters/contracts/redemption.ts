import type { ConfirmedAward } from "~/services/amounts/awards"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type RedeemCodeRequest = {
  request: ApiServiceRequest
  code: string
}

export type RedemptionCapability = {
  redeem(request: RedeemCodeRequest): Promise<{
    awards: ConfirmedAward[]
    /** Native detail may explain benefits whose amount is not reported. */
    message?: string
  }>
}
