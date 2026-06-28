import type { AccountSiteType } from "~/constants/siteType"
import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import { redemption } from "~/services/apiService/newApiFamily"

/**
 * Create redemption operations bound to the New API-family site type.
 */
export function createNewApiRedemption(
  siteType: AccountSiteType,
): RedemptionCapability {
  const implementation = redemption.createRedemptionImplementation(siteType)

  return {
    redeem: ({ request, code }) => implementation.redeemCode(request, code),
  }
}
