import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import * as redemption from "~/services/apiService/newApiFamily/default/redemption"

/**
 * Create redemption operations bound to the New API-family site type.
 */
export function createNewApiRedemption(): RedemptionCapability {
  return {
    redeem: ({ request, code }) =>
      redemption.defaultRedemptionImplementation.redeemCode(request, code),
  }
}
