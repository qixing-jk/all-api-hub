import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { QuotaAsset } from "~/services/quotaAssets/quotaAsset"

export type RedeemCodeRequest = {
  request: ApiServiceRequest
  code: string
}

export type RedemptionCapability = {
  /** Numeric redemption results use this native asset instead of monetary quota. */
  quotaAsset?: QuotaAsset
  redeem(request: RedeemCodeRequest): Promise<unknown>
}
