import { QUOTA_PER_USD } from "~/constants/money"
import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import { DAYA_ENDPOINTS } from "~/services/apiService/daya/constants"
import { redeemDayaCode } from "~/services/apiService/daya/redemption"
import { invalidDayaResponse } from "~/services/apiService/daya/transport"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

// Match the native form's retry key retention. Bound memory without persisting codes.
const attempts = new Map<string, string>()

export const dayaRedemption: RedemptionCapability = {
  async redeem({ request, code }) {
    const trimmedCode = code.trim()
    if (!trimmedCode)
      throw new Error(t("redemptionAssist:messages.redeemFailed"))
    const attempt = JSON.stringify([
      request.baseUrl,
      request.auth.userId,
      trimmedCode,
    ])
    let key = attempts.get(attempt)
    if (!key) {
      key = crypto.randomUUID()
      if (attempts.size >= 100) attempts.delete(attempts.keys().next().value!)
      attempts.set(attempt, key)
    }
    const result = await redeemDayaCode(request, trimmedCode, key)
    if (!isRecord(result)) return invalidDayaResponse(DAYA_ENDPOINTS.Redeem)
    const message =
      typeof result.message === "string" ? result.message.trim() : ""
    if (
      (result.delivery_status !== undefined &&
        result.delivery_status !== "success") ||
      result.kind === "referral_discount"
    )
      throw new Error(
        [message, t("messages:errors.dayaRedemptionUnconfirmed")]
          .filter(Boolean)
          .join(" "),
      )
    const hasBenefits =
      Array.isArray(result.benefits) && result.benefits.length > 0
    if (
      (["concurrency", "subscription", "quota_reset"].includes(
        String(result.type),
      ) ||
        hasBenefits) &&
      message
    ) {
      attempts.delete(attempt)
      return { message }
    }
    if (
      result.type !== "balance" ||
      hasBenefits ||
      typeof result.value !== "number" ||
      !Number.isFinite(result.value) ||
      result.value < 0 ||
      !Number.isFinite(result.value * QUOTA_PER_USD)
    )
      return invalidDayaResponse(DAYA_ENDPOINTS.Redeem)
    attempts.delete(attempt)
    return result.value * QUOTA_PER_USD
  },
}
