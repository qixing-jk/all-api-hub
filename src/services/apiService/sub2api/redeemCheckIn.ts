/**
 * Verified Sub2API Pro daily check-in protocol transport.
 *
 * Contract pinned to jiangmuran/sub2api_pro@3f8585707632c959ca36be84e13c5a738c005a83
 * and Wei-Shaw/sub2api#510:
 * - `GET /api/v1/redeem/checkin/status` is the read-only probe/status surface;
 *   `POST /api/v1/redeem/checkin` executes the check-in. No alias endpoints.
 * - Success envelopes are `{ code: 0, message: "success", data }`.
 * - Failures are HTTP 403/409 whose top-level numeric `code` mirrors the HTTP
 *   status and whose top-level string `reason` is the authoritative machine
 *   discriminator (`DAILY_CHECKIN_DISABLED`, `DAILY_CHECKIN_ROLE_FORBIDDEN`,
 *   `DAILY_CHECKIN_ALREADY_DONE`).
 */
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { t } from "~/utils/i18n/core"

import { executeSub2ApiAuthenticatedRequest } from "./index"
import { parseSub2ApiEnvelope } from "./parsing"
import {
  SUB2API_REDEEM_CHECKIN_ENDPOINT,
  SUB2API_REDEEM_CHECKIN_ERROR_REASONS,
  SUB2API_REDEEM_CHECKIN_STATUS_ENDPOINT,
  type Sub2ApiRedeemCheckInErrorReason,
  type Sub2ApiRedeemCheckInResultData,
  type Sub2ApiRedeemCheckInStatusData,
} from "./type"

const invalidResponseError = (endpoint: string) =>
  new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

const getErrorCodeForStatus = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/**
 * Normalizes a non-2xx redeem check-in response into an {@link ApiError}.
 *
 * The top-level numeric `code` mirrors the HTTP status per contract, so the
 * HTTP status drives classification while the string `reason` is carried as
 * `upstreamCode`. A recognized `DAILY_CHECKIN_ALREADY_DONE` reason forces
 * statusCode 409 so callers converge on already-checked semantics even if a
 * deployment drifts its HTTP status.
 */
const buildRedeemCheckInHttpError = (
  body: unknown,
  status: number,
  endpoint: string,
): ApiError => {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined

  const rawMessage =
    typeof record?.message === "string" && record.message.trim()
      ? record.message.trim()
      : undefined
  const rawReason =
    typeof record?.reason === "string" ? record.reason.trim() : undefined
  const knownReasons = new Set(
    Object.values(SUB2API_REDEEM_CHECKIN_ERROR_REASONS),
  )
  const reason = knownReasons.has(rawReason as Sub2ApiRedeemCheckInErrorReason)
    ? (rawReason as Sub2ApiRedeemCheckInErrorReason)
    : undefined

  // The contract pins numeric `code` to the HTTP status; only a verified
  // string `reason` is allowed to override it.
  let statusCode = status
  if (
    reason === SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinAlreadyDone &&
    status !== 403
  ) {
    statusCode = 409
  } else if (
    (reason === SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinDisabled ||
      reason ===
        SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinRoleForbidden) &&
    status !== 409
  ) {
    statusCode = 403
  }

  return new ApiError(
    rawMessage ?? `请求失败: ${statusCode}`,
    statusCode,
    endpoint,
    getErrorCodeForStatus(statusCode),
    reason,
  )
}

const runRedeemCheckInRequest = async <T>(
  authRequest: ApiServiceRequest,
  endpoint: string,
  init: RequestInit,
  validate: (data: unknown) => T,
): Promise<T> => {
  const response = await fetchApiResponse<unknown>(authRequest, {
    endpoint,
    options: init,
  })

  if (!response.ok) {
    throw buildRedeemCheckInHttpError(response.body, response.status, endpoint)
  }

  return validate(parseSub2ApiEnvelope(response.body, endpoint))
}

const requireRecord = (
  value: unknown,
  endpoint: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponseError(endpoint)
  }
  return value as Record<string, unknown>
}

const requireTrueBoolean = (value: unknown, endpoint: string): boolean => {
  if (typeof value !== "boolean") {
    throw invalidResponseError(endpoint)
  }
  return value
}

const requireFiniteNumber = (value: unknown, endpoint: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidResponseError(endpoint)
  }
  return value
}

const requireString = (value: unknown, endpoint: string): string => {
  if (typeof value !== "string") {
    throw invalidResponseError(endpoint)
  }
  return value
}

const validateCheckInStatusData = (
  data: unknown,
  endpoint: string,
): Sub2ApiRedeemCheckInStatusData => {
  const record = requireRecord(data, endpoint)

  const enabled = requireTrueBoolean(record.enabled, endpoint)
  const checked_in_today = requireTrueBoolean(record.checked_in_today, endpoint)
  const reward_min = requireFiniteNumber(record.reward_min, endpoint)
  const reward_max = requireFiniteNumber(record.reward_max, endpoint)

  if (reward_min < 0 || reward_min > reward_max) {
    throw invalidResponseError(endpoint)
  }

  const rewardAmount =
    record.reward_amount === undefined || record.reward_amount === null
      ? undefined
      : requireFiniteNumber(record.reward_amount, endpoint)

  return {
    enabled,
    checked_in_today,
    reward_min,
    reward_max,
    ...(rewardAmount !== undefined ? { reward_amount: rewardAmount } : {}),
  }
}

const validateCheckInResultData = (
  data: unknown,
  endpoint: string,
): Sub2ApiRedeemCheckInResultData => {
  const record = requireRecord(data, endpoint)

  return {
    message: requireString(record.message, endpoint),
    reward_amount: requireFiniteNumber(record.reward_amount, endpoint),
    new_balance: requireFiniteNumber(record.new_balance, endpoint),
    checked_in_at: requireString(record.checked_in_at, endpoint),
  }
}

/**
 * Reads the verified daily check-in status through the shared Sub2API
 * authenticated executor so JWT hydration and inline 401 recovery apply.
 */
export function fetchSub2ApiProCheckInStatus(
  request: ApiServiceRequest,
): Promise<Sub2ApiRedeemCheckInStatusData> {
  return executeSub2ApiAuthenticatedRequest(
    request,
    SUB2API_REDEEM_CHECKIN_STATUS_ENDPOINT,
    (authRequest) =>
      runRedeemCheckInRequest(
        authRequest,
        SUB2API_REDEEM_CHECKIN_STATUS_ENDPOINT,
        { method: "GET", cache: "no-store" },
        (data) =>
          validateCheckInStatusData(
            data,
            SUB2API_REDEEM_CHECKIN_STATUS_ENDPOINT,
          ),
      ),
  )
}

/**
 * Executes exactly one daily check-in mutation. Callers own the status-first
 * gating and bounded reconciliation; this transport neither probes nor retries
 * the POST beyond the shared executor's inline 401 recovery.
 */
export function submitSub2ApiProCheckIn(
  request: ApiServiceRequest,
): Promise<Sub2ApiRedeemCheckInResultData> {
  return executeSub2ApiAuthenticatedRequest(
    request,
    SUB2API_REDEEM_CHECKIN_ENDPOINT,
    (authRequest) =>
      runRedeemCheckInRequest(
        authRequest,
        SUB2API_REDEEM_CHECKIN_ENDPOINT,
        { method: "POST" },
        (data) =>
          validateCheckInResultData(data, SUB2API_REDEEM_CHECKIN_ENDPOINT),
      ),
  )
}

/**
 * Returns the verified machine-readable check-in failure reason carried by an
 * error, letting providers classify already-done/disabled/role-forbidden
 * outcomes without depending on internal error construction.
 */
export function getSub2ApiRedeemCheckInErrorReason(
  error: unknown,
): Sub2ApiRedeemCheckInErrorReason | undefined {
  if (!(error instanceof ApiError)) return undefined
  const reasonValues = Object.values(SUB2API_REDEEM_CHECKIN_ERROR_REASONS)
  return reasonValues.find((value) => value === error.upstreamCode)
}
