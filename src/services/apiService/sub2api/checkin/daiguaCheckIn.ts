import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import {
  createDaiguaCheckInStatusEndpoint,
  DAIGUA_CHECK_IN_ENDPOINT,
  DAIGUA_CHECK_IN_STATUS_ENDPOINT,
  resolveDaiguaCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/daiguaCheckInProtocol"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const invalidResponse = (endpoint: string) =>
  new ApiError(
    "Invalid DaiGua ordinary check-in response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Preserve HTTP/upstream rejection codes and validate the native success envelope. */
function parseData(response: ApiTransportResponse<unknown>, endpoint: string) {
  const envelope = record(response.body)
  if (
    response.ok &&
    (typeof envelope?.code !== "number" ||
      !Number.isFinite(envelope.code) ||
      typeof envelope.message !== "string")
  )
    throw invalidResponse(endpoint)
  if (!response.ok || (envelope && envelope.code !== 0)) {
    throw new ApiError(
      "DaiGua check-in request failed",
      response.ok ? undefined : response.status,
      endpoint,
      response.status === 401
        ? API_ERROR_CODES.HTTP_401
        : response.status === 403
          ? API_ERROR_CODES.HTTP_403
          : response.status === 429
            ? API_ERROR_CODES.HTTP_429
            : response.ok
              ? API_ERROR_CODES.BUSINESS_ERROR
              : API_ERROR_CODES.HTTP_OTHER,
      typeof envelope?.reason === "string" ? envelope.reason : undefined,
    )
  }
  if (envelope?.code !== 0 || typeof envelope.message !== "string")
    throw invalidResponse(endpoint)
  const data = record(envelope.data)
  if (!data) throw invalidResponse(endpoint)
  return data
}

/** DaiGua v0.2.15, observed 2026-10-12: ordinary and lucky claims share a day. */
function parseStatus(data: Record<string, unknown>) {
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.can_checkin !== "boolean" ||
    typeof data.luck_enabled !== "boolean"
  )
    throw invalidResponse(DAIGUA_CHECK_IN_STATUS_ENDPOINT)
  if (
    data.unavailable_reason != null &&
    data.unavailable_reason !== "" &&
    data.unavailable_reason !== "admin_disabled"
  )
    throw invalidResponse(DAIGUA_CHECK_IN_STATUS_ENDPOINT)
  const disabled = data.unavailable_reason === "admin_disabled"
  return {
    enabled: data.enabled && !disabled,
    checkedInToday:
      !data.can_checkin && !disabled && (data.enabled || data.luck_enabled),
  }
}

/** Discovery must not refresh, recover or persist credentials. */
export async function fetchDaiguaDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    DAIGUA_CHECK_IN_STATUS_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: createDaiguaCheckInStatusEndpoint(
          resolveDaiguaCheckInTimezone(),
        ),
        options: { method: "GET", cache: "no-store" },
      })
      return parseStatus(parseData(response, DAIGUA_CHECK_IN_STATUS_ENDPOINT))
    },
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
}

/** Native ordinary POST sends {}; failures are reconciled without replay. */
export async function performDaiguaDailyCheckIn(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    DAIGUA_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: DAIGUA_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store", body: "{}" },
      })
      return parseDaiguaDailyCheckInMutationResponse(response)
    },
    { recoverUnauthorized: false },
  )
}

/** Same envelope contract for direct and browser-assisted ordinary grants. */
export function parseDaiguaDailyCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseData(response, DAIGUA_CHECK_IN_ENDPOINT)
  if (
    data.checkin_type !== "normal" ||
    typeof data.reward_amount !== "number" ||
    !Number.isFinite(data.reward_amount) ||
    data.reward_amount < 0
  )
    throw invalidResponse(DAIGUA_CHECK_IN_ENDPOINT)
  return { rewardAmount: data.reward_amount }
}
