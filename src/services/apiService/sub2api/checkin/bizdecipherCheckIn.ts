import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import { postSub2ApiCheckIn } from "~/services/apiService/sub2api/checkin/mutationRequest"
import {
  classifySiblingStatusDto,
  isBizDecipherStatusDto,
  SIBLING_DTO_VERDICTS,
} from "~/services/apiService/sub2api/checkin/siblingStatusContracts"
import {
  PASSIVE_CHECK_IN_AUTH,
  readAuthenticatedCheckInStatus,
  type Sub2ApiCheckInStatusAuth,
} from "~/services/apiService/sub2api/checkin/statusAuthentication"
import {
  createUserCheckInStatusEndpoint,
  resolveUserCheckInTimezone,
  USER_CHECK_IN_STATUS_ENDPOINT,
} from "~/services/apiService/sub2api/checkin/userCheckInProtocol"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import {
  createUnixDayKeyFormatter,
  getDayKeyFromUnixSeconds,
} from "~/utils/core/dayKey"
import { safeRandomUUID } from "~/utils/core/identifier"

export const BIZDECIPHER_FREE_CHECK_IN_ENDPOINT = "/api/v1/user/checkin/claim"
const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("BizDecipher")
const userHeaders = { "X-User-UI-Request": "1" }
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/** Bind both sides of a request to the native client's requested timezone day. */
function captureDay() {
  const timezone = resolveUserCheckInTimezone()
  return {
    timezone,
    day: getDayKeyFromUnixSeconds(Date.now() / 1000, timezone),
  }
}

/** Reject stale dates and any request whose response crossed the timezone's midnight. */
function matchesCurrentDay(value: unknown, day: ReturnType<typeof captureDay>) {
  return (
    value === day.day &&
    getDayKeyFromUnixSeconds(Date.now() / 1000, day.timezone) === day.day
  )
}

/** Bound the POST's queue and request lifetime to the admitted day. */
function claimDeadlineAt(day: ReturnType<typeof captureDay>, now: number) {
  const formatDay = createUnixDayKeyFormatter(day.timezone)
  let lastCurrentSecond = Math.floor(now / 1000)
  if (formatDay(lastCurrentSecond) !== day.day) return 0
  // Search for the first later date instead of assuming a 24-hour local day.
  let firstLaterSecond = lastCurrentSecond + 48 * 60 * 60
  while (firstLaterSecond - lastCurrentSecond > 1) {
    const middle = Math.floor((lastCurrentSecond + firstLaterSecond) / 2)
    if (formatDay(middle) === day.day) lastCurrentSecond = middle
    else firstLaterSecond = middle
  }
  return firstLaterSecond * 1000
}

/** A missing operation receipt is not proof that an in-flight claim was rejected. */
export class BizDecipherCheckInUnconfirmedError extends Error {
  constructor(
    public readonly operationId: string,
    cause: unknown,
  ) {
    super("BizDecipher free check-in operation could not be confirmed", {
      cause,
    })
    this.name = "BizDecipherCheckInUnconfirmedError"
  }
}

/**
 * BizDecipher's public AppLayout-D9Hsahag.js (2026-11-24) exposes a free daily
 * gift and separate paid lotteries. Its server date/free_claimed status owns
 * daily completion; the shared HTTP client adds timezone to every GET.
 */
function parseStatus(
  response: ApiTransportResponse<unknown>,
  day: ReturnType<typeof captureDay>,
) {
  const data = parseEnvelopeData(response, USER_CHECK_IN_STATUS_ENDPOINT)
  if (Object.hasOwn(data, "free_claimed")) {
    if (!isBizDecipherStatusDto(data) || !matchesCurrentDay(data.date, day))
      throw invalidResponse(USER_CHECK_IN_STATUS_ENDPOINT)
    return { enabled: true, checkedInToday: data.free_claimed }
  }
  if (
    classifySiblingStatusDto(
      AUTO_CHECKIN_METHOD_IDS.BizDecipherFreeCheckIn,
      data,
    ) === SIBLING_DTO_VERDICTS.Foreign
  )
    throw new ForeignCheckInContractError(USER_CHECK_IN_STATUS_ENDPOINT, data)
  throw invalidResponse(USER_CHECK_IN_STATUS_ENDPOINT)
}

/** Mirror the native receipt validator, additionally excluding every paid type/cost. */
function parseReceipt(
  response: ApiTransportResponse<unknown>,
  endpoint: string,
  operationId: string,
  day: ReturnType<typeof captureDay>,
) {
  const data = parseEnvelopeData(response, endpoint)
  if (
    data.operation_id !== operationId ||
    data.type !== "free" ||
    data.cost !== 0 ||
    typeof data.date !== "string" ||
    !matchesCurrentDay(data.date, day) ||
    !finite(data.reward) ||
    data.reward < 0 ||
    (data.reward_asset !== "credit" && data.reward_asset !== "balance") ||
    !finite(data.balance_after) ||
    !finite(data.credit_balance_after) ||
    typeof data.already_claimed !== "boolean"
  )
    throw invalidResponse(endpoint)
  return {
    operationId,
    day: data.date,
    alreadyClaimed: data.already_claimed,
    reward: data.reward,
    rewardAsset: data.reward_asset,
  }
}

/** Passive by default; authorized execution admission may renew saved credentials. */
export function fetchBizDecipherDailyCheckInStatus(
  request: ApiServiceRequest,
  auth?: Sub2ApiCheckInStatusAuth,
) {
  const day = captureDay()
  const endpoint = createUserCheckInStatusEndpoint(day.timezone)
  return readAuthenticatedCheckInStatus(
    request,
    endpoint,
    async (authenticated) =>
      parseStatus(
        await fetchApiResponse(authenticated, {
          endpoint,
          options: { method: "GET", cache: "no-store", headers: userHeaders },
        }),
        day,
      ),
    auth,
  )
}

/**
 * Submit only `free` once. A lost or malformed reply is resolved with the same
 * operation ID, never by resubmitting or opening a credit/balance lottery.
 * Unresolved operations remain subject to the executor's non-repeat policy.
 */
export async function performBizDecipherDailyCheckIn(
  request: ApiServiceRequest,
  statusObservedAt = Date.now(),
) {
  const day = captureDay()
  if (
    !Number.isFinite(statusObservedAt) ||
    statusObservedAt > Date.now() ||
    getDayKeyFromUnixSeconds(statusObservedAt / 1000, day.timezone) !== day.day
  )
    throw invalidResponse(USER_CHECK_IN_STATUS_ENDPOINT)
  const operationId = safeRandomUUID("free")
  return executeAuthenticatedSub2ApiRequest(
    request,
    BIZDECIPHER_FREE_CHECK_IN_ENDPOINT,
    async (authenticated) => {
      // Credential hydration or a caller guard must not carry yesterday's admission into a new day.
      const now = Date.now()
      const dispatchDeadlineAt = claimDeadlineAt(day, now)
      const timeRemaining = dispatchDeadlineAt - now
      if (timeRemaining <= 0)
        throw invalidResponse(USER_CHECK_IN_STATUS_ENDPOINT)
      try {
        return parseReceipt(
          await runAbortableTask(
            (signal) =>
              postSub2ApiCheckIn(
                { ...authenticated, abortSignal: signal },
                BIZDECIPHER_FREE_CHECK_IN_ENDPOINT,
                {
                  headers: { ...userHeaders, "Idempotency-Key": operationId },
                  body: JSON.stringify({
                    type: "free",
                    operation_id: operationId,
                  }),
                  dispatchDeadlineAt,
                },
              ),
            { signals: [authenticated.abortSignal], timeoutMs: timeRemaining },
          ),
          BIZDECIPHER_FREE_CHECK_IN_ENDPOINT,
          operationId,
          day,
        )
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.statusCode !== undefined &&
          error.statusCode >= 400 &&
          error.statusCode < 500 &&
          error.statusCode !== 408 &&
          error.statusCode !== 429
        )
          throw error
        if (request.abortSignal?.aborted)
          throw new BizDecipherCheckInUnconfirmedError(operationId, error)
        const endpoint = `/api/v1/user/checkin/operations/${encodeURIComponent(operationId)}?timezone=${encodeURIComponent(day.timezone)}`
        try {
          return parseReceipt(
            await fetchApiResponse(
              { ...authenticated, observer: undefined },
              {
                endpoint,
                options: {
                  method: "GET",
                  cache: "no-store",
                  headers: userHeaders,
                },
              },
            ),
            endpoint,
            operationId,
            day,
          )
        } catch {
          throw new BizDecipherCheckInUnconfirmedError(operationId, error)
        }
      }
    },
    PASSIVE_CHECK_IN_AUTH,
  )
}
