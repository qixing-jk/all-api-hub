import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { parseDecimal } from "~/services/amounts/decimal"
import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import {
  formatRelayForBenefit,
  relayForBenefitAward,
} from "~/services/apiAdapters/relayfor/benefits"
import { redeemRelayForCode } from "~/services/apiService/relayfor"
import { isRecord } from "~/services/apiService/relayfor/parsing"
import { t } from "~/utils/i18n/core"

export const relayForRedemption: RedemptionCapability = {
  async redeem({ request, code }) {
    const result = await redeemRelayForCode(request, code)
    if (!isRecord(result))
      throw new Error(t("messages:errors.relayForRedemptionUnconfirmed"))
    const hasQuota = parseDecimal(result.added_quota) !== undefined
    const benefits = Array.isArray(result.benefits) ? result.benefits : []
    const subscriptions =
      Array.isArray(result.subscriptions) && result.subscriptions.length
        ? result.subscriptions
        : isRecord(result.subscription)
          ? [result.subscription]
          : []
    if (!hasQuota && !benefits.length && !subscriptions.length)
      throw new Error(t("messages:errors.relayForRedemptionUnconfirmed"))
    const grants = [
      ...benefits.map((value, index) => ({
        value,
        field: `benefits.${index}`,
      })),
      ...subscriptions.map((subscription, index) => ({
        field:
          Array.isArray(result.subscriptions) && result.subscriptions.length
            ? `subscriptions.${index}`
            : "subscription",
        value: {
          type:
            typeof result.redeem_type === "string" &&
            result.redeem_type.startsWith("subscription")
              ? result.redeem_type
              : "subscription",
          subscription,
          expires_at: result.expires_at,
          extension_days: result.subscription_extension_days,
        },
      })),
    ]
    // Preserve the existing native detail precedence: added_quota can summarize benefits.
    if (!grants.length && hasQuota)
      grants.push({
        field: "added_quota",
        value: {
          type: result.redeem_type === "prepaid" ? "timed_quota" : "quota",
          quota: result.added_quota,
          quota_group: result.quota_group,
          expires_at: result.expires_at,
        },
      })
    const scope = accountBalanceScope(request)
    const observedAt = Date.now()
    const awards = grants.map(({ value, field }) =>
      relayForBenefitAward(value, {
        scope,
        observedAt,
        field,
        id: field,
        operation: "redeem",
      }),
    )
    const details = grants.map(({ value }) => formatRelayForBenefit(value))
    return {
      awards,
      message: t("redemptionAssist:messages.benefitsRedeemed", {
        details: details.filter(Boolean).join(" + "),
      }),
    }
  },
}
