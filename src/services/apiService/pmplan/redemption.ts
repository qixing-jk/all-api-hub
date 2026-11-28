import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  getRedemptionCodeKind,
  isPossibleRedemptionCode,
  REDEMPTION_CODE_KINDS,
} from "~/services/redemption/utils/redemptionCode"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

import { PMPLAN_ENDPOINTS } from "./constants"
import { fetchPmplan } from "./index"

/** Claims a card for this account; consuming it is a separate native operation. */
export async function redeemPmplanResetCard(
  request: ApiServiceRequest,
  code: string,
) {
  if (
    getRedemptionCodeKind(code) !== REDEMPTION_CODE_KINDS.PmplanResetCard ||
    !isPossibleRedemptionCode(code)
  )
    throw new ApiError(
      t("redemptionAssist:messages.invalidResetCode"),
      undefined,
      undefined,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  const result = await fetchPmplan(request, PMPLAN_ENDPOINTS.RedeemResetCard, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  })
  if (!isRecord(result) || result.ok !== true)
    throw new ApiError(
      "Invalid PM-Plan redemption response",
      undefined,
      PMPLAN_ENDPOINTS.RedeemResetCard,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  // An acknowledged claim remains successful even if optional card metadata is absent.
  request.observer?.onMutationAccepted?.()
}
