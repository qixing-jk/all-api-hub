import type { AccountSiteType } from "~/constants/siteType"
import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import { getApiService } from "~/services/apiService"

/**
 * Create redemption operations bound to the New API-family site type.
 */
export function createNewApiRedemption(
  siteType: AccountSiteType,
): RedemptionCapability {
  return {
    redeem: ({ request, code }) =>
      getApiService(siteType).redeemCode(request, code),
  }
}
