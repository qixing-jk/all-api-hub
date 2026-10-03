import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { executeAuthenticatedSub2ApiRequest } from "./authLifecycle"
import {
  TOOLCODE_DAILY_CHECK_IN_ENDPOINT as CHECK_IN_ENDPOINT,
  createToolcodeCheckInStatusEndpoint,
  resolveToolcodeCheckInTimezone,
  TOOLCODE_CHECK_IN_STATUS_ENDPOINT as STATUS_ENDPOINT,
} from "./toolcodeCheckInProtocol"

// https://toolcode.top/engagement, observed 2026-10-04: Bearer-authenticated
// growth-center status is distinct from the other Sub2API check-in protocols.

export const TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: "applied",
  AlreadyChecked: "already_checked",
} as const

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const invalidResponse = (endpoint: string) =>
  new ApiError(
    "Invalid ToolCode check-in response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Accept only an authoritative success envelope, preserving HTTP failures. */
function parseData(
  response: { ok: boolean; status: number; body: unknown },
  endpoint: string,
) {
  if (!response.ok) {
    throw new ApiError(
      `ToolCode check-in request failed with HTTP ${response.status}`,
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
  )
    throw invalidResponse(endpoint)
  if (envelope.code !== 0)
    throw new ApiError(
      "ToolCode check-in business error",
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  const data = toRecord(envelope.data)
  if (!data) throw invalidResponse(endpoint)
  return data
}

/** Read-only discovery never refreshes or rotates the saved credentials. */
export async function fetchToolcodeDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    STATUS_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: createToolcodeCheckInStatusEndpoint(
          resolveToolcodeCheckInTimezone(),
        ),
        options: { method: "GET", cache: "no-store" },
      })
      const data = parseData(response, STATUS_ENDPOINT)
      if (
        typeof data.checkin_enabled !== "boolean" ||
        typeof data.checked_in_today !== "boolean" ||
        typeof data.can_checkin !== "boolean"
      )
        throw invalidResponse(STATUS_ENDPOINT)
      return {
        // Match the page's can_checkin gate while retaining an already-checked day.
        enabled:
          data.checkin_enabled && (data.checked_in_today || data.can_checkin),
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

/** Submit once; the outer execution flow reconciles lost responses by GET. */
export async function performToolcodeDailyCheckIn(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
      const envelope = toRecord(response.body)
      // Live duplicate POST: HTTP 409, code 409, reason CHECKIN_ALREADY_COMPLETED;
      // a follow-up GET confirmed no second award. Do not match arbitrary text/409s.
      if (
        response.status === 409 &&
        envelope?.code === 409 &&
        envelope.reason === "CHECKIN_ALREADY_COMPLETED"
      ) {
        return { kind: TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked }
      }
      const data = parseData(response, CHECK_IN_ENDPOINT)
      if (
        data.checked_in_today !== true ||
        !Number.isSafeInteger(data.points_reward) ||
        (data.points_reward as number) < 0 ||
        typeof data.reward_amount !== "number" ||
        !Number.isFinite(data.reward_amount) ||
        data.reward_amount < 0
      )
        throw invalidResponse(CHECK_IN_ENDPOINT)
      return {
        kind: TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
        data: {
          pointsReward: data.points_reward as number,
          bonusAmount: data.reward_amount,
        },
      }
    },
    { recoverUnauthorized: false },
  )
}
