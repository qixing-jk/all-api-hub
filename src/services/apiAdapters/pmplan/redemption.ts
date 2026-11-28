import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import { NATIVE_RESOURCE_MUTATION_CERTAINTIES } from "~/services/apiAdapters/contracts/resourceNative"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import { redeemPmplanResetCard } from "~/services/apiService/pmplan/redemption"
import { RedemptionOutcomeUncertainError } from "~/services/redemption/errors"
import { t } from "~/utils/i18n/core"

export const pmplanRedemption: RedemptionCapability = {
  async redeem({ request, code }) {
    const result = await runNativeResourceMutation({
      request,
      execute: (observed) =>
        redeemPmplanResetCard(
          { ...request, observer: observed.observer },
          code,
        ),
      mapFailure: (error) => error,
    })
    if (
      result.certainty === NATIVE_RESOURCE_MUTATION_CERTAINTIES.PossiblyApplied
    )
      throw new RedemptionOutcomeUncertainError(
        t("redemptionAssist:messages.pmplanClaimUncertain"),
      )
    if (result.certainty === NATIVE_RESOURCE_MUTATION_CERTAINTIES.NotApplied)
      throw result.failure
    return {
      awards: [],
      message: t("redemptionAssist:messages.pmplanCardClaimed"),
    }
  },
}
