import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  createUserCheckInStatusEndpoint,
  resolveUserCheckInTimezone,
  USER_CHECK_IN_STATUS_ENDPOINT,
} from "~/services/apiService/sub2api/checkin/userCheckInProtocol"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

const CLAWHUD_DAILY_CHECK_IN_ENDPOINT = "/api/v1/user/checkin"

/** Upstream reason carried by the duplicate-mutation error envelope. */
export const CLAWHUD_DAILY_CHECK_IN_ERROR_CODES = {
  AlreadyChecked: "CHECKIN_ALREADY_DONE",
} as const

export const CLAWHUD_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: "applied",
} as const

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const getHttpErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

const invalidResponse = (endpoint: string) =>
  new ApiError(
    "Invalid Clawhud daily check-in response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/**
 * This deployment's envelopes keep `code` numeric on success but switch to a
 * string (`UNAUTHORIZED`) on transport-level failures, and failure envelopes
 * carry their classification in `reason` (verified 2026-10-11 at
 * https://api.clawhud.com). Preserve both for the provider's mapping.
 */
const parseEnvelopeData = (
  response: ApiTransportResponse<unknown>,
  endpoint: string,
): Record<string, unknown> => {
  const envelope = toRecord(response.body)
  if (!envelope) {
    if (!response.ok) {
      throw new ApiError(
        `Clawhud daily check-in request failed with HTTP ${response.status}`,
        response.status,
        endpoint,
        getHttpErrorCode(response.status),
      )
    }
    throw invalidResponse(endpoint)
  }

  if (
    (typeof envelope.code !== "string" && typeof envelope.code !== "number") ||
    typeof envelope.message !== "string"
  ) {
    throw invalidResponse(endpoint)
  }

  const upstreamCode =
    typeof envelope.reason === "string" && envelope.reason
      ? envelope.reason
      : String(envelope.code)
  const message = envelope.message.trim() || undefined
  const isSuccessEnvelope = envelope.code === 0 && response.ok

  if (!isSuccessEnvelope) {
    throw new ApiError(
      message ??
        `Clawhud daily check-in request failed with HTTP ${response.status}`,
      response.ok ? undefined : response.status,
      endpoint,
      response.ok
        ? API_ERROR_CODES.BUSINESS_ERROR
        : getHttpErrorCode(response.status),
      upstreamCode,
    )
  }

  const data = toRecord(envelope.data)
  if (!data) throw invalidResponse(endpoint)
  return data
}

/**
 * Deployment-owned contract observed at https://api.clawhud.com/dashboard on
 * 2026-10-11: the status DTO names its already-checked field
 * `checked_in_today`, unlike the Genius Programmer sibling that shares the
 * same path. A valid Genius Programmer status with `today_checked_in` and
 * `enabled` booleans belongs to a foreign contract. Discovery marks that
 * method unsupported; missing or malformed status fields remain unknown.
 */
export function parseClawhudDailyCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, USER_CHECK_IN_STATUS_ENDPOINT)
  if (
    Object.hasOwn(data, "checked_in_today") &&
    Object.hasOwn(data, "today_checked_in")
  ) {
    throw invalidResponse(USER_CHECK_IN_STATUS_ENDPOINT)
  }
  if (
    !Object.hasOwn(data, "checked_in_today") &&
    typeof data.enabled === "boolean" &&
    typeof data.today_checked_in === "boolean"
  ) {
    throw new ForeignCheckInContractError(USER_CHECK_IN_STATUS_ENDPOINT, data)
  }
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.checked_in_today !== "boolean"
  ) {
    throw invalidResponse(USER_CHECK_IN_STATUS_ENDPOINT)
  }
  return { enabled: data.enabled, checkedInToday: data.checked_in_today }
}

/**
 * The dashboard posts without a body and reports the granted award as
 * `today_amount` (`new_balance` matched `/auth/me` on the verified grant).
 * An already-checked duplicate never reaches this success path: it answers
 * HTTP 409 with `reason: CHECKIN_ALREADY_DONE`, which surfaces through the
 * error envelope's upstream code instead.
 */
export function parseClawhudDailyCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, CLAWHUD_DAILY_CHECK_IN_ENDPOINT)
  if (data.checked_in_today !== true) {
    throw invalidResponse(CLAWHUD_DAILY_CHECK_IN_ENDPOINT)
  }
  if (
    typeof data.today_amount !== "number" ||
    !Number.isFinite(data.today_amount) ||
    data.today_amount < 0
  ) {
    throw invalidResponse(CLAWHUD_DAILY_CHECK_IN_ENDPOINT)
  }
  return {
    kind: CLAWHUD_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    data: { rewardAmount: data.today_amount },
  }
}

/** Reads deployment status with the same timezone query as its dashboard. */
export async function fetchClawhudDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  const endpoint = createUserCheckInStatusEndpoint(resolveUserCheckInTimezone())
  return executeAuthenticatedSub2ApiRequest(
    request,
    USER_CHECK_IN_STATUS_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint,
        options: { method: "GET", cache: "no-store" },
      })
      return parseClawhudDailyCheckInStatusResponse(response)
    },
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
}

/**
 * Submit once after the provider's authoritative status gate. The backend
 * answers duplicates with a classified 409 rather than a replayable failure,
 * so any other failure is left to outer status reconciliation without
 * repeating the write here.
 */
export async function performClawhudDailyCheckIn(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    CLAWHUD_DAILY_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: CLAWHUD_DAILY_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
      return parseClawhudDailyCheckInMutationResponse(response)
    },
    { recoverUnauthorized: false },
  )
}
