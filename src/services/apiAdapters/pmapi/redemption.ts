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
import { redeemPmApiCode } from "~/services/apiService/pmapi/redemption"

/** Redemption grants account credit in the console's New API quota unit. */
export const pmApiRedemption: RedemptionCapability = {
  async redeem({ request, code }) {
    const result = await redeemPmApiCode(request, code)
    return {
      awards: [
        confirmedAward({
          id: "credit",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          value: result.quotaGranted,
          nativeUnitsPerAsset: 500000,
          source: {
            adapter: "pmapi",
            operation: "redeem",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
            inputs: ["quota"],
          },
          scope: accountBalanceScope(request),
          observedAt: Date.now(),
          fulfillment: AWARD_FULFILLMENT.Credited,
          target: AWARD_TARGETS.Wallet,
        }),
      ],
    }
  },
}
