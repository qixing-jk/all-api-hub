import { CHECK_IN_METHOD_DETECTION_OUTCOMES } from "~/constants/checkIn"
import { compareDecimal, parseDecimal } from "~/services/amounts/decimal"
import { NATIVE_RESOURCE_MUTATION_CERTAINTIES } from "~/services/apiAdapters/contracts/resourceNative"
import { postSub2ApiCheckIn } from "~/services/apiService/sub2api/checkin/mutationRequest"
import {
  executeSub2ApiCheckInWithRecovery,
  type Sub2ApiCheckInRecoveryOptions,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import type { Sub2ApiCheckInStatusAuth } from "./statusAuthentication"
import {
  fetchAuthenticatedCheckInStatusText,
  fetchCheckInStatusText,
  tryParseCheckInJson,
} from "./textStatusRequest"

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
export { CHECK_IN_ENDPOINT as XIAOBAI_CODE_DAILY_CHECK_IN_ENDPOINT }

export const XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: NATIVE_RESOURCE_MUTATION_CERTAINTIES.Applied,
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
        "authentication_required" | "permission_denied" | "invalid_response"
    }

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/**
 * Reads the app's status without mutating anything. A deployment that does not
 * host the app answers with its frontend SPA fallback (HTTP 200 HTML), so a
 * non-JSON body is an ordinary negative rather than an unknown instance of the
 * app; JSON with an unexpected shape, authentication failures, server errors,
 * and transport failures stay unknown.
 */
export async function probeXiaobaiCodeCheckInStatus(
  request: ApiServiceRequest,
  auth?: Sub2ApiCheckInStatusAuth,
): Promise<XiaobaiCodeStatusProbe> {
  const response = auth
    ? await fetchAuthenticatedCheckInStatusText(request, STATUS_ENDPOINT, auth)
    : await fetchCheckInStatusText(request, STATUS_ENDPOINT)
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
  const parsed = tryParseCheckInJson(response.body)
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
  options: Sub2ApiCheckInRecoveryOptions = {},
) {
  return executeSub2ApiCheckInWithRecovery(
    request,
    CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await postSub2ApiCheckIn<string>(
        authenticatedRequest,
        CHECK_IN_ENDPOINT,
        {
          headers: { "Content-Type": "application/json" },
          body: "{}",
          responseType: "text",
          isNativeLoginRejection: (body) =>
            body.ok === false &&
            body.code === "LOGIN_REQUIRED" &&
            Object.keys(body).length === 3,
        },
      )
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
      const parsed = tryParseCheckInJson(response.body)
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
      const record = toRecord(data.record)
      const rewardAmount = toAmount(record?.reward_amount)
      if (rewardAmount === null) throw invalidCheckInResponse()
      const recordId = record?.id
      const rewardRecordId =
        typeof recordId === "string" && recordId.trim()
          ? recordId.trim()
          : typeof recordId === "number" &&
              Number.isSafeInteger(recordId) &&
              recordId >= 0
            ? String(recordId)
            : undefined
      return {
        kind: XIAOBAI_CODE_DAILY_CHECK_IN_RESULT_KINDS.Applied,
        data: { rewardAmount, ...(rewardRecordId ? { rewardRecordId } : {}) },
      }
    },
    async (recoveredRequest) => {
      const probe = await probeXiaobaiCodeCheckInStatus(recoveredRequest)
      if (probe.outcome !== CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched)
        throw new Error("Check-in status unavailable")
      return probe.status
    },
    options,
  )
}

/** Reads the deployment's decimal amounts, which mix numbers and strings. */
function toAmount(value: unknown): number | string | null {
  if (typeof value === "number") {
    return parseDecimal(value) !== undefined && value >= 0 ? value : null
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) {
    const amount = parseDecimal(value)
    return amount !== undefined && compareDecimal(amount, "0") >= 0
      ? value
      : null
  }
  return null
}
