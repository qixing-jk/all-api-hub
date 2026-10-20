import { quotaToUsd } from "~/services/apiService/relayfor/constants"
import { isRecord } from "~/services/apiService/relayfor/parsing"
import { t } from "~/utils/i18n/core"

/** Formats confirmed native grants without converting burst credits into money. */
export function formatRelayForBenefit(value: unknown): string {
  if (!isRecord(value)) return ""
  const labels: Record<string, string> = {
    quota: t("redemptionAssist:benefits.quota"),
    timed_quota: t("redemptionAssist:benefits.timedQuota"),
    group_quota: t("redemptionAssist:benefits.groupQuota"),
    group_timed_quota: t("redemptionAssist:benefits.groupTimedQuota"),
    burst_credits: t("redemptionAssist:benefits.burstCredits"),
    timed_burst_credits: t("redemptionAssist:benefits.timedBurstCredits"),
    subscription: t("redemptionAssist:benefits.subscription"),
    subscription_trial: t("redemptionAssist:benefits.subscriptionTrial"),
    subscription_extension: t(
      "redemptionAssist:benefits.subscriptionExtension",
    ),
    subscription_quota_reset: t("redemptionAssist:benefits.subscriptionReset"),
    subscription_quota_add: t("redemptionAssist:benefits.subscriptionAdd"),
  }
  const subscription = isRecord(value.subscription) ? value.subscription : value
  const parts = [
    typeof value.type === "string" ? labels[value.type] ?? value.type : "",
    subscription.plan_name ?? subscription.plan_code,
  ]
  const amount = value.quota ?? subscription.quota_total
  if (typeof amount === "number" && Number.isFinite(amount))
    parts.push(`${quotaToUsd(amount)} USD`)
  if (subscription.unlimited_quota === true)
    parts.push(t("common:quota.unlimited"))
  if (
    typeof value.burst_credits === "number" &&
    Number.isFinite(value.burst_credits)
  )
    parts.push(`${value.burst_credits} ${labels.burst_credits}`)
  if (typeof value.quota_group === "string")
    parts.push(`${labels.group_quota}: ${value.quota_group}`)
  const expiry = value.expires_at ?? subscription.expires_at
  if (typeof expiry === "string")
    parts.push(t("account:stats.allowanceExpiry", { time: expiry }))
  if (typeof value.extension_days === "number")
    parts.push(
      t("redemptionAssist:messages.extensionDays", {
        days: value.extension_days,
      }),
    )
  if (value.fallback_used === true)
    parts.push(t("redemptionAssist:messages.fallbackBenefit"))
  return parts
    .filter((part): part is string => typeof part === "string" && !!part)
    .join(" · ")
}
