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

import { PMAPI_ENDPOINTS } from "./constants"
import { fetchPmApiIdentity } from "./identity"
import { fetchPmApiEnvelope, invalidPmApiResponse } from "./transport"

/**
 * Balance is the console's stored credit in its own New API quota unit; the
 * extension keeps that unit and converts at display time.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const identity = await fetchPmApiIdentity(request)
  const result: AccountData = {
    quota: identity.quota,
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
  // The stats route reports only consumption, requests and tokens; there is
  // no income concept anywhere in the console.
  result.todayStatsAvailability!.income = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
  }
  if (request.includeTodayCashflow === false) return result
  try {
    const envelope = await fetchPmApiEnvelope(
      request,
      PMAPI_ENDPOINTS.TodayStats,
    )
    const stats = envelope.data
    if (!isRecord(stats))
      return invalidPmApiResponse(PMAPI_ENDPOINTS.TodayStats)
    const today = stats.today
    if (!isRecord(today))
      return invalidPmApiResponse(PMAPI_ENDPOINTS.TodayStats)
    const number = (key: string) => {
      const value = today[key]
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        return invalidPmApiResponse(PMAPI_ENDPOINTS.TodayStats)
      return value
    }
    result.today_quota_consumption = number("quota")
    result.today_requests_count = number("requests")
    // The console reports one combined token total without a prompt/output
    // split; it is carried whole in the prompt field.
    result.today_prompt_tokens = number("tokens")
    result.today_completion_tokens = 0
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
}
