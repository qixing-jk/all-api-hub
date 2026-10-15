import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { AccountSubscriptionSummary } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { isRecord } from "~/utils/core/object"

import {
  KRILL_ENDPOINTS,
  KRILL_TODAY_TIME_ZONE_OFFSET_MINUTES,
} from "./constants"
import { fetchKrillIdentity } from "./identity"
import {
  invalidKrillResponse,
  krillNumber,
  readKrillEnvelope,
  usdAmount,
  withKrillSession,
} from "./transport"

/** The console's own "today" range, in the site's Asia/Shanghai day boundary. */
function todayRange(now = Date.now()) {
  const local = new Date(now + KRILL_TODAY_TIME_ZONE_OFFSET_MINUTES * 60_000)
  const day = local.toISOString().slice(0, 10)
  return { start: `${day}T00:00`, end: `${day}T23:59:59` }
}

/** Plan names come from the subscription rows; anything else stays unmapped. */
function subscriptionSummary(
  data: Record<string, unknown>,
  endpoint: string,
): AccountSubscriptionSummary | undefined {
  const subscriptions = data.subscriptions
  if (!Array.isArray(subscriptions)) invalidKrillResponse(endpoint)
  if (subscriptions.length === 0) return undefined
  const summary = isRecord(data.summary) ? data.summary : undefined
  if (!summary) invalidKrillResponse(endpoint)
  const rowExpiries = subscriptions
    .flatMap((item) =>
      isRecord(item) &&
      typeof item.subscription_end_at === "string" &&
      Number.isFinite(Date.parse(item.subscription_end_at))
        ? [item.subscription_end_at]
        : [],
    )
    .sort((a, b) => Date.parse(b) - Date.parse(a))
  const endAt = summary.subscription_end_at ?? rowExpiries[0]
  if (endAt !== undefined && endAt !== null && typeof endAt !== "string")
    invalidKrillResponse(endpoint)
  const names = subscriptions.flatMap((item) =>
    isRecord(item) &&
    isRecord(item.plan) &&
    typeof item.plan.name === "string" &&
    item.plan.name.trim()
      ? [item.plan.name.trim()]
      : [],
  )
  return {
    ...(names.length ? { name: names.join(" · ") } : {}),
    amountLimit:
      usdAmount(summary.total_daily_quota_usd, endpoint) * QUOTA_PER_USD,
    usedAmount: usdAmount(summary.total_used_usd, endpoint) * QUOTA_PER_USD,
    remainingAmount:
      usdAmount(summary.total_remaining_usd, endpoint) * QUOTA_PER_USD,
    ...(typeof endAt === "string" ? { expireTime: endAt } : {}),
    isActive: subscriptions.some(
      (item) => isRecord(item) && item.status === "active",
    ),
  }
}

/**
 * Cash balance is pay-as-you-go USD; plan allowance is a separate daily quota
 * that is consumed first, so the two are never merged. Welfare credit has no
 * verified cash value and is deliberately not added to the balance.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    const subscriptionBody = await readKrillEnvelope(
      scoped,
      KRILL_ENDPOINTS.Subscription,
    )
    const data = subscriptionBody.data
    if (!isRecord(data)) invalidKrillResponse(KRILL_ENDPOINTS.Subscription)
    const endpoint = KRILL_ENDPOINTS.Subscription
    const result: AccountData = {
      quota: usdAmount(data.credit_balance_usd, endpoint) * QUOTA_PER_USD,
      subscription: subscriptionSummary(data, endpoint),
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_income: 0,
      todayStatsAvailability: createUnavailableTodayStatsAvailability(
        ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
      ),
      checkIn: request.checkIn,
    }
    result.todayStatsAvailability!.income = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    }
    if (request.includeTodayCashflow === false) return result
    try {
      const { start, end } = todayRange()
      const body = await readKrillEnvelope(scoped, KRILL_ENDPOINTS.TodayStats, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_time: start, end_time: end }),
      })
      const stats = body.data
      if (!isRecord(stats)) invalidKrillResponse(KRILL_ENDPOINTS.TodayStats)
      const number = (key: string) => {
        const value = krillNumber(stats[key], KRILL_ENDPOINTS.TodayStats)
        if (value < 0) invalidKrillResponse(KRILL_ENDPOINTS.TodayStats)
        return value
      }
      const input = number("input_tokens"),
        output = number("output_tokens")
      result.today_quota_consumption =
        usdAmount(stats.total_cost_usd, KRILL_ENDPOINTS.TodayStats) *
        QUOTA_PER_USD
      result.today_requests_count = number("total_requests")
      result.today_prompt_tokens =
        input +
        number("cache_creation_input_tokens") +
        number("cache_read_input_tokens")
      result.today_completion_tokens = output
      for (const key of ["consumption", "requests", "tokens"] as const)
        result.todayStatsAvailability![key] = {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
        }
    } catch (error) {
      if (
        scoped.abortSignal?.aborted ||
        (error instanceof ApiError &&
          (error.statusCode === 401 ||
            error.statusCode === 403 ||
            error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH))
      )
        throw error
      const reason =
        error instanceof ApiError &&
        error.code === API_ERROR_CODES.JSON_PARSE_ERROR
          ? ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload
          : ACCOUNT_TODAY_METRIC_REASONS.RequestFailed
      for (const key of ["consumption", "requests", "tokens"] as const)
        result.todayStatsAvailability![key] = {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason,
        }
    }
    return result
  })
}

export { fetchKrillUserInfo } from "./identity"
export {
  fetchKrillAnnouncementItems,
  fetchKrillInviteLink,
  redeemKrillCode,
  type KrillAnnouncementItem,
} from "./surfaces"
export {
  fetchKrillModelIds,
  fetchKrillModelPricing,
  type KrillModelPricingEntry,
} from "./catalog"
