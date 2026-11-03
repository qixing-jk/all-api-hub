import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import {
  BAI_API_CHECK_IN_ENDPOINT,
  BAI_API_CHECK_IN_STATUS_ENDPOINT,
  createBaiApiCheckInStatusEndpoint,
  resolveBaiApiCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/baiApiCheckInProtocol"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { readPositiveDecimalAmount } from "~/services/checkin/autoCheckin/providers/shared"

/**
 * The 柏API deployment serves its daily rewards module from the host's own
 * `/api/v1` namespace with the host's `{ code, message, data }` envelope, but
 * the module is a deployment addition: upstream Sub2API has no daily-rewards
 * route, and other Sub2API installations answer this path with the Go
 * default `404 page not found`. Availability is therefore decided by the
 * status DTO, never by the hostname.
 *
 * The dashboard reads with `GET .../status` and submits with an empty
 * `POST .../checkin`; the browser's axios interceptor appends
 * `?timezone=<IANA>` to GETs, so the day boundary is the reader's timezone.
 */

const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("柏API")

/** A blank day string is not a day, even when its type is right. */
const isDay = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

/**
 * Reads the deployment's status without mutating anything. The status DTO
 * names today's state `checked_today` and the current day `checkin_date`;
 * the module has no separate enablement switch, so any structurally valid
 * status is an enabled method.
 */
export function parseBaiApiCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
): { enabled: boolean; checkedInToday: boolean; streakDays?: number } {
  const data = parseEnvelopeData(response, BAI_API_CHECK_IN_STATUS_ENDPOINT)
  if (typeof data.checked_today !== "boolean" || !isDay(data.checkin_date)) {
    throw invalidResponse(BAI_API_CHECK_IN_STATUS_ENDPOINT)
  }
  return {
    enabled: true,
    checkedInToday: data.checked_today,
    ...readStreakDays(data),
  }
}

/**
 * The submit response is the day's result record rather than the status DTO:
 * it carries `checkin_date` and `streak_days`, and names the award
 * `cash_amount_usd` (the header card reads `draw.cash_amount_usd` first and
 * falls back to this field). A malformed success is not a confirmed grant; an
 * absent or zero award is still a granted day without an authoritative amount,
 * so the reward stays unset instead of becoming a shown zero.
 */
export function parseBaiApiCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, BAI_API_CHECK_IN_ENDPOINT)
  if (!isDay(data.checkin_date)) {
    throw invalidResponse(BAI_API_CHECK_IN_ENDPOINT)
  }
  const rewardAmount = readBaiApiAward(data)
  return {
    checkinDate: data.checkin_date,
    ...readStreakDays(data),
    ...(rewardAmount === undefined ? {} : { rewardAmount }),
  }
}

/**
 * Reads the awarded USD amount from the record's fields. The header card
 * prefers a blind-box draw amount over the plain record amount, so the same
 * precedence applies here; an absent or zero amount stays unset instead of
 * becoming a shown zero.
 */
export function readBaiApiAward(data: Record<string, unknown>) {
  const draw = data.draw
  const drawAmount =
    draw !== null && typeof draw === "object" && !Array.isArray(draw)
      ? (draw as Record<string, unknown>).cash_amount_usd
      : undefined
  // Select the authoritative field before filtering zero/malformed amounts.
  // A zero draw is a result, not evidence that the record should take precedence.
  return readPositiveDecimalAmount(drawAmount ?? data.cash_amount_usd)
}

/** Keeps a valid whole-day streak; a malformed one is simply not reported. */
function readStreakDays(data: Record<string, unknown>) {
  return typeof data.streak_days === "number" &&
    Number.isInteger(data.streak_days) &&
    data.streak_days >= 0
    ? { streakDays: data.streak_days }
    : {}
}

/**
 * Reads status as a passive probe: no token refresh, no browser recovery, so
 * discovery cannot issue credentials or open a login window.
 */
export async function fetchBaiApiCheckInStatus(
  request: ApiServiceRequest,
  timezone = resolveBaiApiCheckInTimezone(),
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    BAI_API_CHECK_IN_STATUS_ENDPOINT,
    async (authenticated) => {
      const response = await fetchApiResponse<unknown>(authenticated, {
        endpoint: createBaiApiCheckInStatusEndpoint(timezone),
        options: { method: "GET", cache: "no-store" },
      })
      return parseBaiApiCheckInStatusResponse(response)
    },
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
}

/**
 * Submits once after the provider's authoritative status gate. The dashboard
 * re-reads status after a failure to decide whether the day was applied, so an
 * uncertain result is left to the scheduler's status reconciliation rather
 * than replayed here.
 *
 * Duplicate semantics are unverified: the front end assumes a success envelope
 * and only falls back to a status re-read on error, which proves the UI keeps
 * running but not that a second POST awards nothing. The endpoint therefore
 * keeps the family's default 401 recovery (a replay there is re-gated by the
 * caller's fresh status check) and never gets an automatic replay policy.
 */
export async function performBaiApiCheckIn(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    BAI_API_CHECK_IN_ENDPOINT,
    async (authenticated) => {
      const response = await fetchApiResponse<unknown>(authenticated, {
        endpoint: BAI_API_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
      return parseBaiApiCheckInMutationResponse(response)
    },
  )
}
