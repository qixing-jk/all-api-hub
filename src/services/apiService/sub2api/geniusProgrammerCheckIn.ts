import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

import { executeAuthenticatedSub2ApiRequest } from "./authLifecycle"

const GENIUS_PROGRAMMER_DAILY_CHECK_IN_STATUS_ENDPOINT =
  "/api/v1/user/checkin/status"
const GENIUS_PROGRAMMER_DAILY_CHECK_IN_ENDPOINT = "/api/v1/user/checkin"

export const GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: "applied",
  AlreadyChecked: "already_checked",
} as const

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const invalidResponse = (endpoint: string) =>
  new ApiError(
    "Invalid Genius Programmer daily check-in response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

const parseData = (
  response: ApiTransportResponse<unknown>,
  endpoint: string,
) => {
  if (!response.ok) {
    throw new ApiError(
      `Genius Programmer daily check-in request failed with HTTP ${response.status}`,
      response.status,
      endpoint,
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
    throw invalidResponse(endpoint)
  }
  if (envelope.code !== 0) {
    throw new ApiError(
      "Genius Programmer daily check-in business error",
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }
  const data = toRecord(envelope.data)
  if (!data) throw invalidResponse(endpoint)
  return data
}

/**
 * Deployment-owned contract observed at https://codexcli.club/dashboard on
 * 2026-09-14: /user/checkin/status uses today_checked_in, unlike Sub2API Pro.
 * Discard nested history/user records; only retain authoritative status fields.
 */
export function parseGeniusProgrammerDailyCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseData(
    response,
    GENIUS_PROGRAMMER_DAILY_CHECK_IN_STATUS_ENDPOINT,
  )
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.today_checked_in !== "boolean"
  ) {
    throw invalidResponse(GENIUS_PROGRAMMER_DAILY_CHECK_IN_STATUS_ENDPOINT)
  }
  return { enabled: data.enabled, checkedInToday: data.today_checked_in }
}

/**
 * https://codexcli.club/assets/user-DMko4IQ8.js posts without a body; the
 * dashboard uses new_reward to distinguish an award from an existing record.
 * The already-checked HTTP 200 envelope was verified in the logged-in browser.
 */
export function parseGeniusProgrammerDailyCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseData(response, GENIUS_PROGRAMMER_DAILY_CHECK_IN_ENDPOINT)
  if (typeof data.new_reward !== "boolean") {
    throw invalidResponse(GENIUS_PROGRAMMER_DAILY_CHECK_IN_ENDPOINT)
  }
  if (!data.new_reward) {
    return {
      kind: GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
    }
  }
  if (
    typeof data.reward_amount !== "number" ||
    !Number.isFinite(data.reward_amount) ||
    data.reward_amount < 0
  ) {
    throw invalidResponse(GENIUS_PROGRAMMER_DAILY_CHECK_IN_ENDPOINT)
  }
  return {
    kind: GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    data: { rewardAmount: data.reward_amount },
  }
}

/** Reads deployment status with the same timezone query as its dashboard. */
export async function fetchGeniusProgrammerDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  let timezone = "UTC"
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    /* Runtime timezone is optional. */
  }
  return executeAuthenticatedSub2ApiRequest(
    request,
    GENIUS_PROGRAMMER_DAILY_CHECK_IN_STATUS_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: `${GENIUS_PROGRAMMER_DAILY_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`,
        options: { method: "GET", cache: "no-store" },
      })
      return parseGeniusProgrammerDailyCheckInStatusResponse(response)
    },
    { proactiveRefresh: false, recoverUnauthorized: false },
  )
}

/**
 * Submit once after the provider's authoritative status gate. Backend replay
 * guarantees are unverified: leave failures to outer status reconciliation,
 * including unauthorized responses, rather than replaying a write here.
 */
export async function performGeniusProgrammerDailyCheckIn(
  request: ApiServiceRequest,
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    GENIUS_PROGRAMMER_DAILY_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: GENIUS_PROGRAMMER_DAILY_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
      return parseGeniusProgrammerDailyCheckInMutationResponse(response)
    },
    { recoverUnauthorized: false },
  )
}
