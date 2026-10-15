import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

const SIDRUNE_CHECK_IN_STATUS_ENDPOINT = "/api/v1/welfare/profile"
const SIDRUNE_CHECK_IN_ENDPOINT = "/api/v1/welfare/checkin"

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const invalidResponse = (endpoint: string) =>
  new ApiError(
    "Invalid Sidrune welfare check-in response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Preserve HTTP/business failures separately from malformed successful envelopes. */
function readData(response: ApiTransportResponse<unknown>, endpoint: string) {
  const body = record(response.body)
  if (!response.ok || (body && body.code !== 0)) {
    const code =
      response.status === 401
        ? API_ERROR_CODES.HTTP_401
        : response.status === 403
          ? API_ERROR_CODES.HTTP_403
          : response.status === 429
            ? API_ERROR_CODES.HTTP_429
            : response.ok
              ? API_ERROR_CODES.BUSINESS_ERROR
              : API_ERROR_CODES.HTTP_OTHER
    throw new ApiError(
      typeof body?.message === "string"
        ? body.message
        : "Sidrune welfare request failed",
      response.ok ? undefined : response.status,
      endpoint,
      code,
      typeof body?.reason === "string"
        ? body.reason
        : String(body?.code ?? response.status),
    )
  }
  const data = record(body?.data)
  if (body?.code !== 0 || typeof body.message !== "string" || !data)
    throw invalidResponse(endpoint)
  return data
}

/**
 * Native welfare profile on global.sidrune.ai/welfare uses a fixed UTC+8 day
 * and separate enablement, API-usage eligibility and today's state. Discovery
 * is strictly passive: it must not rotate tokens or open a recovery page.
 */
export async function fetchSidruneDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    SIDRUNE_CHECK_IN_STATUS_ENDPOINT,
    async (authenticated) => {
      const response = await fetchApiResponse<unknown>(authenticated, {
        endpoint: SIDRUNE_CHECK_IN_STATUS_ENDPOINT,
        options: { method: "GET", cache: "no-store" },
      })
      const data = readData(response, SIDRUNE_CHECK_IN_STATUS_ENDPOINT)
      if (
        typeof data.enabled !== "boolean" ||
        typeof data.eligible !== "boolean" ||
        typeof data.checked_in_today !== "boolean"
      ) {
        throw invalidResponse(SIDRUNE_CHECK_IN_STATUS_ENDPOINT)
      }
      return {
        enabled: data.enabled && data.eligible,
        checkedInToday: data.checked_in_today,
      }
    },
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
}

/** Native welfare module posts without a body; response fields come from WelfareView. */
export async function performSidruneDailyCheckIn(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    SIDRUNE_CHECK_IN_ENDPOINT,
    async (authenticated) => {
      const response = await fetchApiResponse<unknown>(authenticated, {
        endpoint: SIDRUNE_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
      const data = readData(response, SIDRUNE_CHECK_IN_ENDPOINT)
      const amount = data.reward_amount
      const bonus = data.milestone_bonus
      const day = data.streak_day
      if (
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        typeof bonus !== "number" ||
        !Number.isFinite(bonus) ||
        bonus < 0 ||
        typeof day !== "number" ||
        !Number.isInteger(day) ||
        day < 1 ||
        day > 30
      ) {
        throw invalidResponse(SIDRUNE_CHECK_IN_ENDPOINT)
      }
      return { rewardAmount: amount, milestoneBonus: bonus, streakDay: day }
    },
    { proactiveRefresh: false, recoverUnauthorized: false },
  )
}
