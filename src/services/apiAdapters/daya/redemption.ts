import { CURRENCIES } from "~/constants/money"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { confirmedAward } from "~/services/amounts/awards"
import { compareDecimal, parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  EVIDENCE_KINDS,
} from "~/services/amounts/financialConstants"
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
    const benefits: unknown[] = Array.isArray(result.benefits)
      ? result.benefits
      : []
    const hasBenefits = benefits.length > 0
    const deliveryConfirmed = result.delivery_status === "success"
    const scope = accountBalanceScope(request)
    const observedAt = Date.now()
    if (
      (["concurrency", "subscription", "quota_reset"].includes(
        String(result.type),
      ) ||
        hasBenefits) &&
      (message || deliveryConfirmed)
    ) {
      attempts.delete(attempt)
      const grants = hasBenefits
        ? [
            ...(result.type === "balance"
              ? [{ benefit: result, field: "value" }]
              : []),
            ...benefits.map((benefit: unknown, index: number) => ({
              benefit,
              field: `benefits.${index}`,
            })),
          ]
        : [{ benefit: result, field: "value" }]
      return {
        ...(message ? { message } : {}),
        awards: grants.map(
          ({ benefit, field }: { benefit: unknown; field: string }) => {
            const item = isRecord(benefit) ? benefit : {}
            return confirmedAward({
              id: field,
              asset:
                item.type === "balance"
                  ? { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }
                  : { kind: ASSET_KINDS.Unknown },
              value: item.value,
              source: {
                adapter: "daya",
                operation: "redeem",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
                inputs: [field],
              },
              scope,
              observedAt,
              target:
                item.type === "balance"
                  ? AWARD_TARGETS.Wallet
                  : ["concurrency", "subscription", "quota_reset"].includes(
                        String(item.type),
                      )
                    ? AWARD_TARGETS.Entitlement
                    : AWARD_TARGETS.Unknown,
              fulfillment: AWARD_FULFILLMENT.Credited,
            })
          },
        ),
      }
    }
    const value = parseDecimal(result.value)
    if (
      result.type !== "balance" ||
      hasBenefits ||
      (!deliveryConfirmed &&
        (value === undefined || compareDecimal(value, "0") < 0))
    )
      return invalidDayaResponse(DAYA_ENDPOINTS.Redeem)
    attempts.delete(attempt)
    return {
      awards: [
        confirmedAward({
          id: "credit",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          value: result.value,
          source: {
            adapter: "daya",
            operation: "redeem",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
            inputs: ["value"],
          },
          scope,
          observedAt,
          target: AWARD_TARGETS.Wallet,
          fulfillment: AWARD_FULFILLMENT.Credited,
        }),
      ],
    }
  },
}
