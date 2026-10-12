import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { ACCOUNT_TODAY_METRIC_REASONS } from "~/types/accountTodayStats"
import { isRecord } from "~/utils/core/object"

import {
  FOXCODE_ENDPOINTS,
  FOXCODE_NON_RESETTING_PLAN,
  FOXCODE_UNITS_PER_USD,
} from "./constants"
import { parseFoxCodeIdentity } from "./identity"
import {
  invalidFoxCodeResponse,
  readFoxCode,
  withFoxCodeSession,
} from "./transport"
import { fetchRecentUsage } from "./usage"

export { FOXCODE_UNITS_PER_USD } from "./constants"
/** Reject missing or malformed monetary facts instead of displaying zero. */
export function foxCodeAmount(value: unknown, endpoint: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw invalidFoxCodeResponse(endpoint)
  return value
}

/** Validate the live console identity before returning any saved-account facts. */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const endpoint = FOXCODE_ENDPOINTS.Identity
  const user = parseFoxCodeIdentity({
    success: true,
    data: await readFoxCode(request, endpoint),
  })
  if (!user) throw invalidFoxCodeResponse(endpoint)
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId).trim() &&
    String(request.auth.userId) !== user.id
  )
    throw new ApiError(
      "FoxCode account identity mismatch",
      undefined,
      endpoint,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return user
}

/** Accept dashboard facts only for the verified saved identity. */
export async function fetchDashboard(request: ApiServiceRequest) {
  return withFoxCodeSession(request, async (request) => {
    const user = await fetchUserInfo(request)
    const data = await readFoxCode(request, FOXCODE_ENDPOINTS.Dashboard)
    const identity = parseFoxCodeIdentity({ success: true, data })
    if (!identity) throw invalidFoxCodeResponse(FOXCODE_ENDPOINTS.Dashboard)
    if (identity.id !== user.id)
      throw new ApiError(
        "FoxCode dashboard identity mismatch",
        undefined,
        FOXCODE_ENDPOINTS.Dashboard,
        API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
      )
    return data
  })
}

/** Native base quota is USD credit; channel multipliers are estimates, never extra balances. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withFoxCodeSession(request, async (request) => {
    const dashboard = await fetchDashboard(request)
    const endpoint = FOXCODE_ENDPOINTS.Dashboard
    if (
      !isRecord(dashboard.subscription) ||
      !Array.isArray(dashboard.subscription.active)
    )
      throw invalidFoxCodeResponse(endpoint)
    const active = dashboard.subscription.active.map((value) => {
      if (
        !isRecord(value) ||
        !isRecord(value.plan) ||
        typeof value.plan.resetType !== "string" ||
        typeof value.plan.name !== "string" ||
        typeof value.endDate !== "string" ||
        !Number.isFinite(Date.parse(value.endDate))
      )
        throw invalidFoxCodeResponse(endpoint)
      return {
        name: value.plan.name,
        reset: value.plan.resetType,
        limit: foxCodeAmount(value.plan.quotaLimit, endpoint),
        used: foxCodeAmount(value.quotaUsed, endpoint),
        remaining: foxCodeAmount(value.quotaRemaining, endpoint),
        expiry: value.endDate,
      }
    })
    const purchased = active.filter(
      (plan) => plan.reset === FOXCODE_NON_RESETTING_PLAN,
    )
    const plans = active.filter(
      (plan) => plan.reset !== FOXCODE_NON_RESETTING_PLAN,
    )
    const sum = (list: typeof active, field: "limit" | "used" | "remaining") =>
      list.reduce((total, plan) => total + plan[field], 0) /
      FOXCODE_UNITS_PER_USD
    const periods = new Set(plans.map((plan) => plan.reset))
    const period = periods.size === 1 ? plans[0]!.reset : undefined
    let recentUsageRecords
    if (request.includeTodayCashflow !== false) {
      try {
        recentUsageRecords = await fetchRecentUsage(request)
      } catch (error) {
        if (
          request.abortSignal?.aborted ||
          (error instanceof ApiError &&
            (error.statusCode === 401 ||
              error.statusCode === 403 ||
              error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH))
        )
          throw error
        // Optional usage failure must not turn a verified balance into zero or fabricated empty history.
      }
    }
    return {
      quota: sum(purchased, "remaining") * QUOTA_PER_USD,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      // The rolling 24-hour chart and client-side zero defaults do not establish today's totals.
      todayStatsAvailability: createUnavailableTodayStatsAvailability(
        ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
      ),
      ...(plans.length
        ? {
            subscription: {
              name: plans.map((plan) => plan.name).join(" / "),
              billingType: "quota",
              amountLimit: sum(plans, "limit"),
              usedAmount: sum(plans, "used"),
              remainingAmount: sum(plans, "remaining"),
              period,
              expireTime: [...plans].sort(
                (a, b) => Date.parse(a.expiry) - Date.parse(b.expiry),
              )[0]!.expiry,
              isActive: true,
            },
          }
        : {}),
      checkIn: request.checkIn,
      ...(recentUsageRecords !== undefined ? { recentUsageRecords } : {}),
    }
  })
}
