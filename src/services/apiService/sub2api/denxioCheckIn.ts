import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  fetchApiResponse,
  notifyApiTransportObserver,
} from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

import { executeAuthenticatedSub2ApiRequest } from "./authLifecycle"

export const DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT =
  "/api/v1/tbe-sponsor-checkin/status"
export const DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT =
  "/api/v1/tbe-sponsor-checkin/normal/begin"
export const DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT =
  "/api/v1/tbe-sponsor-checkin/normal/claim"

export const DENXIO_DAILY_CHECK_IN_ERROR_CODES = {
  Disabled: "TBE_SPONSOR_CHECKIN_DISABLED",
  AlreadyChecked: "TBE_SPONSOR_CHECKIN_ALREADY_DONE",
  NoSponsor: "TBE_SPONSOR_CHECKIN_NO_SPONSOR",
  SessionInvalid: "TBE_SPONSOR_CHECKIN_SESSION_INVALID",
  SessionPending: "TBE_SPONSOR_CHECKIN_SESSION_PENDING",
} as const

export const DENXIO_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: "applied",
  AlreadyChecked: "already_checked",
  Disabled: "disabled",
  RecoveryStatusUnavailable: "recovery_status_unavailable",
  RecoveryPreconditionFailed: "recovery_precondition_failed",
} as const

const MAX_CHALLENGE_WAIT_SECONDS = 60

interface DenxioDailyCheckInStatus {
  enabled: boolean
  checkedInToday: boolean
}

interface DenxioDailyCheckInChallenge {
  token: string
  waitMilliseconds: number
}

type DenxioDailyCheckInOperationResult =
  | {
      kind: typeof DENXIO_DAILY_CHECK_IN_RESULT_KINDS.Applied
      rewardAmount: number
    }
  | { kind: typeof DENXIO_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked }
  | { kind: typeof DENXIO_DAILY_CHECK_IN_RESULT_KINDS.Disabled }
  | {
      kind: typeof DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryStatusUnavailable
    }
  | {
      kind: typeof DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryPreconditionFailed
    }

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

const createInvalidResponseError = (endpoint: string) =>
  new ApiError(
    "Invalid Denxio daily check-in response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

const parseEnvelopeData = (
  response: ApiTransportResponse<unknown>,
  endpoint: string,
): Record<string, unknown> => {
  const envelope = toRecord(response.body)
  if (!envelope) {
    if (!response.ok) {
      throw new ApiError(
        `Denxio daily check-in request failed with HTTP ${response.status}`,
        response.status,
        endpoint,
        getHttpErrorCode(response.status),
      )
    }
    throw createInvalidResponseError(endpoint)
  }

  if (
    (typeof envelope.code !== "string" && typeof envelope.code !== "number") ||
    typeof envelope.message !== "string"
  ) {
    throw createInvalidResponseError(endpoint)
  }

  const upstreamCode = String(envelope.code)
  const message =
    typeof envelope.message === "string" && envelope.message.trim()
      ? envelope.message.trim()
      : undefined
  const isSuccessEnvelope = envelope.code === 0 && response.ok

  if (!isSuccessEnvelope) {
    throw new ApiError(
      message ??
        `Denxio daily check-in request failed with HTTP ${response.status}`,
      response.ok ? undefined : response.status,
      endpoint,
      response.ok
        ? API_ERROR_CODES.BUSINESS_ERROR
        : getHttpErrorCode(response.status),
      upstreamCode,
    )
  }

  const data = toRecord(envelope.data)
  if (!data) throw createInvalidResponseError(endpoint)
  return data
}

/**
 * Parses the deployment-owned status contract observed at
 * https://api.denxio.top/checkin. The normal flow uses a read-only status,
 * followed by a begin challenge and a delayed claim.
 */
export function parseDenxioDailyCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
): DenxioDailyCheckInStatus {
  const data = parseEnvelopeData(
    response,
    DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT,
  )
  const config = toRecord(data.config)
  if (
    typeof data.normal_done !== "boolean" ||
    typeof config?.normal_checkin_enabled !== "boolean"
  ) {
    throw createInvalidResponseError(DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT)
  }

  return {
    enabled: config.normal_checkin_enabled,
    checkedInToday: data.normal_done,
  }
}

/** Parses one short-lived normal-check-in challenge without retaining sponsor data. */
export function parseDenxioDailyCheckInBeginResponse(
  response: ApiTransportResponse<unknown>,
): DenxioDailyCheckInChallenge {
  const data = parseEnvelopeData(response, DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT)
  const token = typeof data.token === "string" ? data.token.trim() : ""
  const waitSeconds = data.wait_seconds
  if (
    !token ||
    typeof waitSeconds !== "number" ||
    !Number.isFinite(waitSeconds) ||
    waitSeconds < 0 ||
    waitSeconds > MAX_CHALLENGE_WAIT_SECONDS
  ) {
    throw createInvalidResponseError(DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT)
  }

  return { token, waitMilliseconds: Math.ceil(waitSeconds * 1_000) }
}

/** Parses the claim result and keeps only the product-relevant reward amount. */
export function parseDenxioDailyCheckInClaimResponse(
  response: ApiTransportResponse<unknown>,
): { rewardAmount: number } {
  const data = parseEnvelopeData(response, DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT)
  const record = toRecord(data.record)
  if (typeof record?.amount !== "number" || !Number.isFinite(record.amount)) {
    throw createInvalidResponseError(DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT)
  }
  return { rewardAmount: record.amount }
}

const resolveTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

const fetchStatusWithRequest = async (
  request: ApiServiceRequest,
  timezone: string,
): Promise<DenxioDailyCheckInStatus> => {
  const response = await fetchApiResponse<unknown>(request, {
    endpoint: `${DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`,
    options: { method: "GET", cache: "no-store" },
  })
  return parseDenxioDailyCheckInStatusResponse(response)
}

/** Reads status without turning a passive probe into browser-auth recovery. */
export async function fetchDenxioDailyCheckInStatus(
  request: ApiServiceRequest,
): Promise<DenxioDailyCheckInStatus> {
  const timezone = resolveTimezone()
  return executeAuthenticatedSub2ApiRequest(
    request,
    DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT,
    (authenticatedRequest) =>
      fetchStatusWithRequest(authenticatedRequest, timezone),
    { proactiveRefresh: false, recoverUnauthorized: false },
  )
}

class DenxioRecoveredMutationBlockedError extends Error {
  constructor(
    public readonly result: Exclude<
      DenxioDailyCheckInOperationResult,
      { kind: typeof DENXIO_DAILY_CHECK_IN_RESULT_KINDS.Applied }
    >,
  ) {
    super("Denxio recovered mutation blocked by status readback")
    this.name = "DenxioRecoveredMutationBlockedError"
  }
}

const defaultWait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

/**
 * Executes the deployment's two-stage normal check-in. Only middleware-401
 * recovery may replay a stage, and that replay is gated by fresh status and
 * current account intent. Network-loss failures are left to outer uncertain
 * reconciliation and never replayed here.
 */
export async function performDenxioDailyCheckIn(
  request: ApiServiceRequest,
  options: {
    beforeRecoveredMutation?: () => Promise<boolean>
    wait?: (milliseconds: number) => Promise<void>
  } = {},
): Promise<DenxioDailyCheckInOperationResult> {
  const timezone = resolveTimezone()
  const beforeUnauthorizedRetry = async (
    recoveredRequest: ApiServiceRequest,
  ) => {
    const status = await fetchStatusWithRequest(
      recoveredRequest,
      timezone,
    ).catch(() => {
      throw new DenxioRecoveredMutationBlockedError({
        kind: DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryStatusUnavailable,
      })
    })
    if (status.checkedInToday) {
      throw new DenxioRecoveredMutationBlockedError({
        kind: DENXIO_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
      })
    }
    if (!status.enabled) {
      throw new DenxioRecoveredMutationBlockedError({
        kind: DENXIO_DAILY_CHECK_IN_RESULT_KINDS.Disabled,
      })
    }
    if (
      options.beforeRecoveredMutation &&
      !(await options.beforeRecoveredMutation())
    ) {
      throw new DenxioRecoveredMutationBlockedError({
        kind: DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryPreconditionFailed,
      })
    }
    notifyApiTransportObserver(
      recoveredRequest.observer,
      "onPreHandlerUnauthorized",
    )
  }

  try {
    const beginSession = await executeAuthenticatedSub2ApiRequest(
      request,
      DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT,
      async (authenticatedRequest) => {
        const response = await fetchApiResponse<unknown>(authenticatedRequest, {
          endpoint: `${DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`,
          options: {
            method: "POST",
            cache: "no-store",
            body: JSON.stringify({ timezone }),
          },
        })
        return {
          challenge: parseDenxioDailyCheckInBeginResponse(response),
          request: authenticatedRequest,
        }
      },
      { beforeUnauthorizedRetry },
    )

    await (options.wait ?? defaultWait)(beginSession.challenge.waitMilliseconds)
    if (
      options.beforeRecoveredMutation &&
      !(await options.beforeRecoveredMutation())
    ) {
      return {
        kind: DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryPreconditionFailed,
      }
    }

    // The begin response is complete evidence for stage one. Clear it before
    // classifying any claim-stage transport failure.
    notifyApiTransportObserver(
      beginSession.request.observer,
      "onPreHandlerUnauthorized",
    )
    const claim = await executeAuthenticatedSub2ApiRequest(
      beginSession.request,
      DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT,
      async (authenticatedRequest) => {
        const response = await fetchApiResponse<unknown>(authenticatedRequest, {
          endpoint: DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT,
          options: {
            method: "POST",
            cache: "no-store",
            body: JSON.stringify({
              token: beginSession.challenge.token,
              timezone,
            }),
          },
        })
        return parseDenxioDailyCheckInClaimResponse(response)
      },
      { beforeUnauthorizedRetry },
    )

    return {
      kind: DENXIO_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      rewardAmount: claim.rewardAmount,
    }
  } catch (error) {
    if (error instanceof DenxioRecoveredMutationBlockedError) {
      return error.result
    }
    throw error
  }
}
