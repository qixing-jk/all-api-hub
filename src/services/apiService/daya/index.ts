import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { isRecord } from "~/utils/core/object"

import { DAYA_ENDPOINTS, DAYA_TODAY_TIME_ZONE } from "./constants"
import { fetchDayaIdentity } from "./identity"
import {
  dayaNumber,
  fetchDayaEnvelope,
  invalidDayaResponse,
  withDayaSession,
} from "./transport"

/**
 * Cash balance is pay-as-you-go USD credit. The API subscription allowance
 * (`/subscriptions/*`) is a separate quota concept and is not merged into it.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withDayaSession(request, async (request) => {
    const identity = await fetchDayaIdentity(request)
    const endpoint = DAYA_ENDPOINTS.Identity
    if (identity.balanceUsd === null) return invalidDayaResponse(endpoint)
    const result: AccountData = {
      quota: identity.balanceUsd * QUOTA_PER_USD,
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
    // Rewards have no income concept; only consumption, requests and tokens are
    // reported by the dashboard statistics route.
    result.todayStatsAvailability!.income = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    }
    if (request.includeTodayCashflow === false) return result
    const statsEndpoint = `${DAYA_ENDPOINTS.TodayStats}?timezone=${encodeURIComponent(DAYA_TODAY_TIME_ZONE)}`
    try {
      const body = await fetchDayaEnvelope(request, statsEndpoint)
      const stats = body.data
      if (!isRecord(stats)) return invalidDayaResponse(statsEndpoint)
      const number = (key: string) => {
        const value = dayaNumber(stats[key], statsEndpoint)
        if (value < 0) return invalidDayaResponse(statsEndpoint)
        return value
      }
      const input = number("today_input_tokens"),
        cacheCreation = number("today_cache_creation_tokens"),
        cacheRead = number("today_cache_read_tokens")
      result.today_quota_consumption = number("today_cost") * QUOTA_PER_USD
      result.today_requests_count = number("today_requests")
      result.today_prompt_tokens = input + cacheCreation + cacheRead
      result.today_completion_tokens = number("today_output_tokens")
      for (const key of ["consumption", "requests", "tokens"] as const)
        result.todayStatsAvailability![key] = {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
        }
    } catch (error) {
      if (
        request.abortSignal?.aborted ||
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
