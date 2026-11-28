import type { TFunction } from "i18next"

import {
  getRedemptionCodeKind,
  REDEMPTION_CODE_KINDS,
} from "~/services/redemption/utils/redemptionCode"
import { t as defaultT } from "~/utils/i18n/core"

/** A lost mutation reply cannot establish failure or authorize another attempt. */
export function getUnconfirmedRedemptionOutcome(
  code: string,
  t: TFunction = defaultT,
) {
  return {
    success: false,
    retryable: false,
    outcomeUncertain: true,
    message:
      getRedemptionCodeKind(code) === REDEMPTION_CODE_KINDS.PmplanResetCard
        ? t("redemptionAssist:messages.pmplanClaimUncertain")
        : t("redemptionAssist:messages.redemptionUncertain"),
  }
}
