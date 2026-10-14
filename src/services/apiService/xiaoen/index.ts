import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { XIAOEN_ENDPOINTS } from "./constants"
import { parseXiaoenIdentity } from "./identity"
import {
  invalidXiaoenResponse,
  readXiaoen,
  withXiaoenSession,
} from "./transport"

/** Validate all account facts against the saved identity before accepting them. */
export async function fetchIdentity(request: ApiServiceRequest) {
  const data = await readXiaoen(request, XIAOEN_ENDPOINTS.Identity)
  const user = parseXiaoenIdentity({ success: true, data })
  if (!user) throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
  if (request.auth.userId && String(request.auth.userId) !== user.id)
    throw new ApiError(
      "肖恩 AI account identity mismatch",
      undefined,
      XIAOEN_ENDPOINTS.Identity,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return { user, data }
}
/** Return the live console identity after checking its saved-account binding. */
export async function fetchUserInfo(request: ApiServiceRequest) {
  return (await fetchIdentity(request)).user
}
/** Reject missing or invalid native credit values instead of replacing them with zero. */
function credits(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
  return value
}
/** Credits have no verified cash exchange rate. Daily credit expires independently of fixed credit. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withXiaoenSession(request, async (request) => {
    const { data } = await fetchIdentity(request)
    const total = credits(data.quota),
      permanent = credits(data.permanentQuota),
      daily = credits(data.dailyQuota)
    if (
      total !== permanent + daily ||
      typeof data.hasSignedInToday !== "boolean"
    )
      throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
    return {
      quota: 0,
      nativeBalance: { unit: "credits", total, permanent, daily },
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
      checkIn: request.checkIn,
    }
  })
}
