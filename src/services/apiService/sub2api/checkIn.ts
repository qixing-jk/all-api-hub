import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiTransportResponse } from "~/services/apiTransport/type"

export const SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT =
  "/api/v1/redeem/checkin/status"
export const SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT = "/api/v1/redeem/checkin"

export const SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS = {
  Disabled: "DAILY_CHECKIN_DISABLED",
  RoleForbidden: "DAILY_CHECKIN_ROLE_FORBIDDEN",
  AlreadyCheckedToday: "DAILY_CHECKIN_ALREADY_DONE",
} as const

export const SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: "applied",
  AlreadyChecked: "already_checked",
  Disabled: "disabled",
  RoleForbidden: "role_forbidden",
  RecoveryStatusUnavailable: "recovery_status_unavailable",
  RecoveryPreconditionFailed: "recovery_precondition_failed",
} as const

type Sub2ApiProDailyCheckInStatus = {
  enabled: boolean
  checkedInToday: boolean
}

export type Sub2ApiProDailyCheckInMutationResult =
  | {
      kind: typeof SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.Applied
      data: {
        rewardAmount: number
        newBalance: number
        checkedInAt: string
      }
    }
  | {
      kind: typeof SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked
    }
  | { kind: typeof SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.Disabled }
  | { kind: typeof SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RoleForbidden }

export type Sub2ApiProDailyCheckInOperationResult =
  | Sub2ApiProDailyCheckInMutationResult
  | {
      kind: typeof SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryStatusUnavailable
    }
  | {
      kind: typeof SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryPreconditionFailed
    }

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const createInvalidResponseError = (endpoint: string) =>
  new ApiError(
    "Invalid Sub2API Pro daily check-in response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

const createHttpError = (
  response: ApiTransportResponse<unknown>,
  endpoint: string,
) => {
  const body = toRecord(response.body)
  const message =
    typeof body?.message === "string" && body.message.trim()
      ? body.message.trim()
      : `Sub2API Pro daily check-in request failed with HTTP ${response.status}`
  return new ApiError(
    message,
    response.status,
    endpoint,
    response.status === 401
      ? API_ERROR_CODES.HTTP_401
      : response.status === 403
        ? API_ERROR_CODES.HTTP_403
        : API_ERROR_CODES.HTTP_OTHER,
  )
}

const parseSuccessData = (
  response: ApiTransportResponse<unknown>,
  endpoint: string,
): Record<string, unknown> => {
  if (!response.ok) throw createHttpError(response, endpoint)

  const envelope = toRecord(response.body)
  if (
    !envelope ||
    !isFiniteNumber(envelope.code) ||
    typeof envelope.message !== "string"
  ) {
    throw createInvalidResponseError(endpoint)
  }
  if (envelope.code !== 0) {
    throw new ApiError(
      envelope.message.trim() || "Sub2API Pro daily check-in business error",
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  const data = toRecord(envelope.data)
  if (!data) throw createInvalidResponseError(endpoint)
  return data
}

/**
 * Strict parsing for the pinned Sub2API Pro protocol. The fork guarantees the
 * exact routes, success DTOs, 403/409 reasons, transaction, and daily unique
 * record used by the client safety policy.
 * Source: https://github.com/jiangmuran/sub2api_pro/commit/3f8585707632c959ca36be84e13c5a738c005a83
 */
export function parseSub2ApiProDailyCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
): Sub2ApiProDailyCheckInStatus {
  if (response.status !== 200) {
    throw createHttpError(response, SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT)
  }
  const data = parseSuccessData(
    response,
    SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
  )
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.checked_in_today !== "boolean" ||
    !isFiniteNumber(data.reward_min) ||
    !isFiniteNumber(data.reward_max) ||
    data.reward_min < 0 ||
    data.reward_max < data.reward_min ||
    (data.reward_amount !== undefined && !isFiniteNumber(data.reward_amount))
  ) {
    throw createInvalidResponseError(SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT)
  }

  return {
    enabled: data.enabled,
    checkedInToday: data.checked_in_today,
  }
}

const parseErrorReason = (response: ApiTransportResponse<unknown>): string => {
  const envelope = toRecord(response.body)
  if (
    !envelope ||
    !isFiniteNumber(envelope.code) ||
    envelope.code !== response.status ||
    typeof envelope.message !== "string" ||
    typeof envelope.reason !== "string"
  ) {
    throw createInvalidResponseError(SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT)
  }
  return envelope.reason
}

/** Parses one strict Sub2API Pro daily check-in mutation response. */
export function parseSub2ApiProDailyCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
): Sub2ApiProDailyCheckInMutationResult {
  if (response.ok) {
    const data = parseSuccessData(response, SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT)
    if (
      typeof data.message !== "string" ||
      !isFiniteNumber(data.reward_amount) ||
      !isFiniteNumber(data.new_balance) ||
      typeof data.checked_in_at !== "string"
    ) {
      throw createInvalidResponseError(SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT)
    }
    return {
      kind: SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: {
        rewardAmount: data.reward_amount,
        newBalance: data.new_balance,
        checkedInAt: data.checked_in_at,
      },
    }
  }

  if (response.status === 403 || response.status === 409) {
    const reason = parseErrorReason(response)
    if (
      response.status === 409 &&
      reason === SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS.AlreadyCheckedToday
    ) {
      return { kind: SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked }
    }
    if (
      response.status === 403 &&
      reason === SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS.Disabled
    ) {
      return { kind: SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.Disabled }
    }
    if (
      response.status === 403 &&
      reason === SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS.RoleForbidden
    ) {
      return { kind: SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RoleForbidden }
    }
  }

  throw createHttpError(response, SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT)
}
