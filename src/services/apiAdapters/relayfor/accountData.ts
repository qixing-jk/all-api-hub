import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import {
  fetchRelayForOverview,
  fetchRelayForTimedQuotas,
} from "~/services/apiService/relayfor"
import { quotaToUsd } from "~/services/apiService/relayfor/constants"
import { isRecord } from "~/services/apiService/relayfor/parsing"
import type {
  AccountBalanceComponent,
  AccountTodayMetricAvailability,
  AccountTodayStatsAvailability,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types"

const COMPLETE_METRIC: AccountTodayMetricAvailability = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
}

const UNSUPPORTED_INCOME: AccountTodayMetricAvailability = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
}

/**
 * Fetches RelayFor overview and converts it to AccountData.
 */
export async function fetchRelayForAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const overview = await fetchRelayForOverview(request)

  const today = overview.today
  const totalRequests = overview.requests ?? 0
  const totalTokens =
    (overview.input_tokens ?? 0) + (overview.output_tokens ?? 0) ||
    overview.token_count ||
    0
  const totalQuota = overview.total_quota
  const now = Date.now()
  const subscriptions = (overview.active_subscriptions ?? []).filter(
    (item) =>
      item.status === 1 &&
      Date.parse(item.starts_at) <= now &&
      Date.parse(item.expires_at) > now,
  )
  const components: AccountBalanceComponent[] = [
    { kind: "permanent", amount: quotaToUsd(overview.user.quota) },
    { kind: "timed", amount: quotaToUsd(overview.timed_quota ?? 0) },
    ...subscriptions.map(
      (item): AccountBalanceComponent => ({
        kind: "subscription",
        name: item.plan_name ?? item.plan_code,
        amount: item.unlimited_quota
          ? 0
          : quotaToUsd(Math.max(0, item.quota_remaining ?? 0)),
        unlimited: item.unlimited_quota,
        expiresAt: item.expires_at,
        resetAt: item.next_reset_at,
        scope: item.quota_group || undefined,
        unlockedModels: Object.keys(item.model_rules ?? {}),
      }),
    ),
    ...(overview.group_quotas ?? []).flatMap(
      (item): AccountBalanceComponent[] => {
        if (
          !item ||
          typeof item !== "object" ||
          !("quota" in item) ||
          typeof item.quota !== "number"
        )
          return []
        return [
          {
            kind: "group",
            amount: quotaToUsd(item.quota),
            scope: "quota_group" in item ? String(item.quota_group) : undefined,
          },
        ]
      },
    ),
  ]

  let timedDetails: AccountBalanceComponent[] | undefined
  let timedDetailsUnavailable = false
  if ((overview.timed_quota ?? 0) > 0) {
    try {
      const grants = await fetchRelayForTimedQuotas(request)
      timedDetails = grants
        .flatMap((item): AccountBalanceComponent[] => {
          if (
            !isRecord(item) ||
            item.status !== 1 ||
            typeof item.quota_remaining !== "number" ||
            !Number.isFinite(item.quota_remaining) ||
            item.quota_remaining <= 0 ||
            typeof item.expires_at !== "string" ||
            Date.parse(item.expires_at) <= now ||
            !Number.isFinite(Date.parse(item.expires_at))
          )
            return []
          return [
            {
              kind: "timed",
              name: typeof item.name === "string" ? item.name : undefined,
              amount: quotaToUsd(item.quota_remaining),
              scope:
                typeof item.quota_group === "string"
                  ? item.quota_group
                  : undefined,
              expiresAt: item.expires_at,
            },
          ]
        })
        .sort(
          (a, b) =>
            Date.parse(a.expiresAt ?? "") - Date.parse(b.expiresAt ?? ""),
        )
    } catch {
      timedDetailsUnavailable = true
    }
  }

  const todayStatsAvailability: AccountTodayStatsAvailability = {
    consumption: metric(today?.quota),
    requests: metric(today?.requests),
    tokens: metric(
      today?.tokens ??
        (typeof today?.input_tokens === "number" &&
        typeof today?.output_tokens === "number"
          ? today.input_tokens + today.output_tokens
          : undefined),
    ),
    income: UNSUPPORTED_INCOME,
  }

  return {
    quota: overview.user.quota,
    nativeBalance: {
      unit: "USD",
      permanent: quotaToUsd(overview.user.quota),
      daily: quotaToUsd(overview.timed_quota ?? 0),
      total: components
        .filter((item) => item.kind !== "group")
        .reduce((sum, item) => sum + item.amount, 0),
      components,
      timedDetails,
      timedDetailsUnavailable,
    },
    subscription: subscriptions.length
      ? {
          name: subscriptions
            .map((item) => item.plan_name ?? item.plan_code)
            .filter(Boolean)
            .join(" · "),
          isActive: true,
        }
      : undefined,
    today_quota_consumption: today?.quota ?? 0,
    today_prompt_tokens: today?.input_tokens ?? 0,
    today_completion_tokens:
      today?.output_tokens ??
      Math.max(0, (today?.tokens ?? 0) - (today?.input_tokens ?? 0)),
    today_requests_count: today?.requests ?? 0,
    today_income: 0,
    todayStatsAvailability,
    usage:
      typeof totalQuota === "number" && Number.isFinite(totalQuota)
        ? {
            scope: "lifetime",
            totalRequests,
            totalTokens,
            totalCost: quotaToUsd(totalQuota),
          }
        : undefined,
    checkIn: request.checkIn,
  }
}

const metric = (value: unknown): AccountTodayMetricAvailability =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? COMPLETE_METRIC
    : {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
      }

export const relayForAccountData: AccountDataCapability = {
  fetchData: (request) => fetchRelayForAccountData(request),
}
