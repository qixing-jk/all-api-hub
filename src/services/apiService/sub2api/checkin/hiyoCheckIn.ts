import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import {
  createHiyoCheckInStatusEndpoint,
  HIYO_CHECK_IN_ENDPOINT,
  resolveHiyoCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/hiyoCheckInProtocol"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const invalidResponse = () =>
  new ApiError(
    "Invalid Hiyo daily check-in response",
    undefined,
    HIYO_CHECK_IN_ENDPOINT,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Validate the native success envelope without concealing HTTP failures. */
function parseData(response: ApiTransportResponse<unknown>) {
  if (!response.ok) {
    throw new ApiError(
      `Hiyo daily check-in request failed with HTTP ${response.status}`,
      response.status,
      HIYO_CHECK_IN_ENDPOINT,
      response.status === 401
        ? API_ERROR_CODES.HTTP_401
        : response.status === 403
          ? API_ERROR_CODES.HTTP_403
          : response.status === 429
            ? API_ERROR_CODES.HTTP_429
            : API_ERROR_CODES.HTTP_OTHER,
    )
  }
  const envelope = toRecord(response.body)
  if (
    typeof envelope?.code !== "number" ||
    !Number.isFinite(envelope.code) ||
    typeof envelope.message !== "string"
  ) {
    throw invalidResponse()
  }
  if (envelope.code !== 0) {
    throw new ApiError(
      "Hiyo daily check-in business error",
      undefined,
      HIYO_CHECK_IN_ENDPOINT,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }
  const data = toRecord(envelope.data)
  if (!data) throw invalidResponse()
  return data
}

/**
 * https://free.hiyo.top/dashboard, observed 2026-10-10. The native daily claim
 * is distinct from bonus claims exposed by the same endpoint and can_claim.
 */
function parseStatus(data: Record<string, unknown>) {
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.daily_claimed !== "boolean" ||
    typeof data.daily_available !== "boolean" ||
    typeof data.can_claim !== "boolean" ||
    typeof data.tokens_met !== "boolean"
  )
    throw invalidResponse()
  return {
    enabled:
      data.enabled &&
      (data.daily_claimed ||
        (data.daily_available && data.can_claim && data.tokens_met)),
    checkedInToday: data.daily_claimed,
  }
}

/** Passive discovery never renews or recovers the account credentials. */
export async function fetchHiyoDailyCheckInStatus(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    HIYO_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: createHiyoCheckInStatusEndpoint(resolveHiyoCheckInTimezone()),
        options: { method: "GET", cache: "no-store" },
      })
      return parseStatus(parseData(response))
    },
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
}

/**
 * Native user-B-g3wqMl.js posts {} without Turnstile. A claim can consume a
 * bonus after the daily grant, so never replay POST, including after a 401.
 * The provider requires fresh daily eligibility; outer execution reconciles
 * uncertain replies with GET. Only an explicit daily award is a daily reward.
 */
export async function performHiyoDailyCheckIn(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    HIYO_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: HIYO_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store", body: "{}" },
      })
      const data = parseData(response)
      const status = toRecord(data.status)
      if (
        data.type !== "daily" ||
        typeof data.amount !== "number" ||
        !Number.isFinite(data.amount) ||
        data.amount < 0 ||
        !status ||
        !parseStatus(status).checkedInToday
      )
        throw invalidResponse()
      return { rewardAmount: data.amount }
    },
    { recoverUnauthorized: false },
  )
}
