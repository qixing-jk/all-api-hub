import { CURRENCIES } from "~/constants/money"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { confirmedAward } from "~/services/amounts/awards"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  EVIDENCE_KINDS,
} from "~/services/amounts/financialConstants"
import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import * as redemption from "~/services/apiService/newApiFamily/default/redemption"

/**
 * Create redemption operations bound to the New API-family site type.
 */
export function createNewApiRedemption(): RedemptionCapability {
  return {
    async redeem({ request, code }) {
      const quota = await redemption.defaultRedemptionImplementation.redeemCode(
        request,
        code,
      )
      const award = confirmedAward({
        id: "credit",
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        value: quota,
        nativeUnitsPerAsset: 500000,
        source: {
          adapter: "new-api",
          operation: "redeem",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
          inputs: ["data"],
        },
        scope: accountBalanceScope(request),
        observedAt: Date.now(),
        fulfillment: AWARD_FULFILLMENT.Credited,
        target: AWARD_TARGETS.Wallet,
      })
      return { awards: [award] }
    },
  }
}
