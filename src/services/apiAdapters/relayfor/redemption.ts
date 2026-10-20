import type { RedemptionCapability } from "~/services/apiAdapters/contracts/redemption"
import { formatRelayForBenefit } from "~/services/apiAdapters/relayfor/benefits"
import { redeemRelayForCode } from "~/services/apiService/relayfor"
import { isRecord } from "~/services/apiService/relayfor/parsing"
import { t } from "~/utils/i18n/core"

export const relayForRedemption: RedemptionCapability = {
  async redeem({ request, code }) {
    const result = await redeemRelayForCode(request, code)
    if (!isRecord(result))
      throw new Error(t("messages:errors.relayForRedemptionUnconfirmed"))
    const hasQuota =
      typeof result.added_quota === "number" &&
      Number.isFinite(result.added_quota)
    const benefits = Array.isArray(result.benefits) ? result.benefits : []
    const subscriptions =
      Array.isArray(result.subscriptions) && result.subscriptions.length
        ? result.subscriptions
        : isRecord(result.subscription)
          ? [result.subscription]
          : []
    if (!hasQuota && !benefits.length && !subscriptions.length)
      throw new Error(t("messages:errors.relayForRedemptionUnconfirmed"))
    if (
      hasQuota &&
      !result.quota_group &&
      result.redeem_type !== "prepaid" &&
      !benefits.length &&
      !subscriptions.length
    )
      return result.added_quota
    const details = benefits.length
      ? benefits.map(formatRelayForBenefit)
      : subscriptions.length
        ? subscriptions.map((subscription) =>
            formatRelayForBenefit({
              type: result.redeem_type,
              subscription,
              extension_days: result.subscription_extension_days,
            }),
          )
        : [
            formatRelayForBenefit({
              type: result.redeem_type === "prepaid" ? "timed_quota" : "quota",
              quota: result.added_quota,
              quota_group: result.quota_group,
              expires_at: result.expires_at,
            }),
          ]
    return {
      message: t("redemptionAssist:messages.benefitsRedeemed", {
        details: details.filter(Boolean).join(" + "),
      }),
    }
  },
}
