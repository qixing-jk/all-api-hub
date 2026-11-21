import { CURRENCIES } from "~/constants/money"
import { confirmedAward, type ConfirmedAward } from "~/services/amounts/awards"
import type { UsageScope } from "~/services/amounts/balance"
import {
  compareDecimal,
  divideDecimalByInteger,
  parseDecimal,
} from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { isRecord } from "~/services/apiService/relayfor/parsing"
import { t } from "~/utils/i18n/core"

/** Preserve one confirmed native grant; a subscription's total capacity is not an amount credited. */
export function relayForBenefitAward(
  value: unknown,
  context: {
    scope: UsageScope
    operation: string
    field: string
    id: string
    observedAt: number
  },
): ConfirmedAward {
  const benefit = isRecord(value) ? value : {}
  const subscription = isRecord(benefit.subscription)
    ? benefit.subscription
    : benefit
  const type = typeof benefit.type === "string" ? benefit.type : "unknown"
  const monetary = [
    "quota",
    "timed_quota",
    "group_quota",
    "group_timed_quota",
  ].includes(type)
  const burst = type === "burst_credits" || type === "timed_burst_credits"
  const amount = monetary
    ? benefit.quota
    : burst
      ? benefit.burst_credits
      : undefined
  const expiry = benefit.expires_at ?? subscription.expires_at
  const expiresAt = typeof expiry === "string" ? Date.parse(expiry) : NaN
  return confirmedAward({
    id: context.id,
    scope: {
      ...context.scope,
      ...(typeof benefit.quota_group === "string" && benefit.quota_group
        ? {
            groups: {
              kind: SCOPE_SELECTION_KINDS.Restricted,
              ids: [benefit.quota_group],
            } as const,
          }
        : {}),
    },
    source: {
      adapter: "relayfor",
      operation: context.operation,
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
      inputs: [context.field],
    },
    asset: monetary
      ? { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }
      : burst
        ? {
            kind: ASSET_KINDS.Quota,
            id: `relayfor:${context.scope.authority}:burst-credits`,
            label: "burst credits",
            displayScale: 1,
            displayLabel: "burst credits",
          }
        : { kind: ASSET_KINDS.Unknown },
    value: amount,
    nativeUnitsPerAsset: monetary ? 500000 : undefined,
    observedAt: context.observedAt,
    target: type.startsWith("subscription")
      ? AWARD_TARGETS.Entitlement
      : monetary || burst
        ? AWARD_TARGETS.Wallet
        : AWARD_TARGETS.Unknown,
    fulfillment: AWARD_FULFILLMENT.Credited,
    validity: Number.isFinite(expiresAt)
      ? { kind: BALANCE_VALIDITY_KINDS.Expires, at: expiresAt }
      : { kind: BALANCE_VALIDITY_KINDS.Unknown },
  })
}

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
    typeof value.type === "string" ? (labels[value.type] ?? value.type) : "",
    subscription.plan_name ?? subscription.plan_code,
  ]
  const amountText = (raw: unknown, scale = 1) => {
    const parsed = parseDecimal(raw)
    if (parsed !== undefined && compareDecimal(parsed, "0") >= 0) {
      try {
        return divideDecimalByInteger(parsed, scale)
      } catch {
        /* Keep the confirmed benefit when its amount cannot be displayed. */
      }
    }
    return t("common:labels.unknown")
  }
  if (value.quota !== undefined)
    parts.push(`${amountText(value.quota, 500000)} USD`)
  if (subscription.quota_total !== undefined)
    parts.push(
      t("redemptionAssist:messages.totalAllowance", {
        amount: `${amountText(subscription.quota_total, 500000)} USD`,
      }),
    )
  if (subscription.unlimited_quota === true)
    parts.push(t("common:quota.unlimited"))
  if (value.burst_credits !== undefined)
    parts.push(`${amountText(value.burst_credits)} ${labels.burst_credits}`)
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
