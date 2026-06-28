import type { AccountSiteType } from "~/constants/siteType"
import * as commonRedemption from "~/services/apiService/common"
import type { ApiServiceRequest } from "~/services/apiService/common/type"

interface RedemptionImplementation {
  redeemCode: (
    request: ApiServiceRequest,
    redemptionCode: string,
  ) => Promise<number>
}

const defaultRedemptionImplementation: RedemptionImplementation = {
  redeemCode: commonRedemption.redeemCode,
}

/**
 * Create redemption operations bound to a New API-family site type.
 */
export function createRedemptionImplementation(
  _siteType: AccountSiteType,
): RedemptionImplementation {
  return {
    redeemCode: (request, redemptionCode) =>
      defaultRedemptionImplementation.redeemCode(request, redemptionCode),
  }
}
