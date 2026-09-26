import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { executeAuthenticatedSub2ApiRequest } from "./authLifecycle"

/**
 * The 小白Code deployment serves its check-in app on its own origin, outside
 * the host's `/api/v1` namespace, and answers with `{ ok, data }` rather than
 * the host's `{ code, message, data }` envelope.
 *
 * The path is fixed rather than discovered. The host's custom page declaration
 * would be an alternative locator, but a deployment can leave the app out of
 * its sidebar while still serving it, so the declaration is not a reliable
 * gate; the app's own answer is.
 */
const STATUS_ENDPOINT = "/checkin/api/status"
const CHECK_IN_ENDPOINT = "/checkin/api/checkin"

export const XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: "applied",
  AlreadyChecked: "already_checked",
} as const

export const XIAOBAI_CODE_STATUS_OUTCOMES = {
  Matched: "matched",
  /** The origin answered, but is not this app. */
  Absent: "absent",
  /** The origin could not be read authoritatively. */
  Unknown: "unknown",
} as const

export type XiaobaiCodeStatusProbe =
  | {
      outcome: typeof XIAOBAI_CODE_STATUS_OUTCOMES.Matched
      status: { enabled: boolean; checkedInToday: boolean }
    }
  | { outcome: typeof XIAOBAI_CODE_STATUS_OUTCOMES.Absent }
  | {
      outcome: typeof XIAOBAI_CODE_STATUS_OUTCOMES.Unknown
      reason:
        | "authentication_required"
        | "permission_denied"
        | "invalid_response"
    }

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const tryParseJson = (body: string): unknown => {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

/**
 * Reads the app's status without mutating anything. A deployment that does not
 * host the app answers with its frontend SPA fallback (HTTP 200 HTML), so a
 * non-JSON body is an ordinary negative rather than an unknown instance of the
 * app; JSON with an unexpected shape, authentication failures, server errors,
 * and transport failures stay unknown.
 */
export async function probeXiaobaiCodeCheckInStatus(
  request: ApiServiceRequest,
): Promise<XiaobaiCodeStatusProbe> {
  const response = await fetchApiResponse<string>(request, {
    endpoint: STATUS_ENDPOINT,
    options: { method: "GET", cache: "no-store" },
    responseType: "text",
  })
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) {
      return { outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Absent }
    }
    if (response.status === 401) {
      return {
        outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
        reason: "authentication_required",
      }
    }
    if (response.status === 403) {
      return {
        outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
        reason: "permission_denied",
      }
    }
    return {
      outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
      reason: "invalid_response",
    }
  }
  const parsed = tryParseJson(response.body)
  if (parsed === undefined) {
    return { outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Absent }
  }
  const envelope = toRecord(parsed)
  const data = envelope?.ok === true ? toRecord(envelope.data) : null
  const config = toRecord(data?.config)
  if (
    typeof config?.enabled !== "boolean" ||
    typeof data?.signedToday !== "boolean"
  ) {
    return {
      outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Unknown,
      reason: "invalid_response",
    }
  }
  return {
    outcome: XIAOBAI_CODE_STATUS_OUTCOMES.Matched,
    status: { enabled: config.enabled, checkedInToday: data.signedToday },
  }
}

const invalidCheckInResponse = (): ApiError =>
  new ApiError(
    "Invalid 小白Code daily check-in response",
    undefined,
    CHECK_IN_ENDPOINT,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/**
 * Submits once, after the caller has just confirmed the app is there. A
 * duplicate day is a successful `alreadyChecked: true` envelope carrying the
 * day's existing record, so an already-applied result must not be reported as
 * a new award.
 */
export async function performXiaobaiCodeDailyCheckIn(
  request: ApiServiceRequest,
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<string>(authenticatedRequest, {
        endpoint: CHECK_IN_ENDPOINT,
        options: {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
        responseType: "text",
      })
      if (!response.ok) {
        throw new ApiError(
          `小白Code daily check-in failed with HTTP ${response.status}`,
          response.status,
          CHECK_IN_ENDPOINT,
          response.status === 401
            ? API_ERROR_CODES.HTTP_401
            : response.status === 403
              ? API_ERROR_CODES.HTTP_403
              : response.status === 429
                ? API_ERROR_CODES.HTTP_429
                : API_ERROR_CODES.HTTP_OTHER,
        )
      }
      const parsed = tryParseJson(response.body)
      if (parsed === undefined) throw invalidCheckInResponse()
      const envelope = toRecord(parsed)
      const data = envelope?.ok === true ? toRecord(envelope.data) : null
      if (typeof data?.alreadyChecked !== "boolean") {
        throw invalidCheckInResponse()
      }
      if (data.alreadyChecked) {
        return {
          kind: XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
        }
      }
      const rewardAmount = toAmount(toRecord(data.record)?.reward_amount)
      if (rewardAmount === null) throw invalidCheckInResponse()
      return {
        kind: XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
        data: { rewardAmount },
      }
    },
    { recoverUnauthorized: false },
  )
}

/** Reads the deployment's decimal amounts, which mix numbers and strings. */
function toAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) {
    const amount = Number(value)
    return Number.isFinite(amount) ? amount : null
  }
  return null
}
