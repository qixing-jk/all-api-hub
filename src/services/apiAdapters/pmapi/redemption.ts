import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import { redeemPmApiCode } from "~/services/apiService/pmapi/redemption"

/** Redemption grants account credit in the console's New API quota unit. */
export const pmApiRedemption: RedemptionCapability = {
  async redeem({ request, code }) {
    const result = await redeemPmApiCode(request, code)
    return result.quotaGranted
  },
}
