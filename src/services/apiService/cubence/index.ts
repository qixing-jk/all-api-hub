import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { CUBENCE_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { isRecord } from "~/utils/core/object"

import { CUBENCE_ME_ENDPOINT, readCubenceUser } from "./identity"
import { withCubenceSession } from "./session"
import {
  cubenceNumber,
  invalidCubenceResponse,
  readCubenceResponse,
} from "./transport"

export const CUBENCE_UNITS_PER_USD = 1_000_000
const TODAY_ENDPOINT = "/api/v1/analytics/apikeys/hourly-usage?range=today"

/**
 * Purchased USD credit is distinct from charity credit and discontinued plans.
 * https://docs.cubence.com/en/docs/guides/pricing and console keys: 1 USD = 1e6 units.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withCubenceSession(request, async (scoped) => {
    const user = await readCubenceUser(scoped)
    const data: AccountData = {
      quota:
        (cubenceNumber(user.normal_balance, CUBENCE_ME_ENDPOINT) /
          CUBENCE_UNITS_PER_USD) *
        QUOTA_PER_USD,
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
    data.todayStatsAvailability!.income = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    }
    if (request.includeTodayCashflow === false) return data
    try {
      const body = await readCubenceResponse(scoped, TODAY_ENDPOINT)
      const summary = body.summary
      // The native today window is Asia/Shanghai, not the rolling 24-hour range.
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      if (
        body.range !== "today" ||
        body.window_start !== `${today}T00:00:00+08:00` ||
        !isRecord(summary)
      )
        invalidCubenceResponse(TODAY_ENDPOINT)
      const number = (key: string) => {
        const value = cubenceNumber(summary[key], TODAY_ENDPOINT)
        if (value < 0) invalidCubenceResponse(TODAY_ENDPOINT)
        return value
      }
      const cost = number("cost"),
        calls = number("calls"),
        total = number("tokens"),
        output = number("output_tokens")
      if (output > total) invalidCubenceResponse(TODAY_ENDPOINT)
      data.today_quota_consumption =
        (cost / CUBENCE_UNITS_PER_USD) * QUOTA_PER_USD
      data.today_requests_count = calls
      data.today_prompt_tokens = total - output
      data.today_completion_tokens = output
      for (const key of ["consumption", "requests", "tokens"] as const)
        data.todayStatsAvailability![key] = {
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
        data.todayStatsAvailability![key] = {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason,
        }
    }
    return data
  })
}

/** Native referral URL; this does not enroll users or withdraw commission. */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  return withCubenceSession(request, async (request) => {
    await readCubenceUser(request)
    const body = await readCubenceResponse(request, "/api/v1/invite/my-code")
    const code = isRecord(body.data) ? body.data.invite_code : undefined
    if (typeof code !== "string" || !code.trim())
      throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
    return `${CUBENCE_WEB_ORIGIN}/signup?code=${encodeURIComponent(code.trim())}`
  })
}
