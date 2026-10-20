import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { EMRANK_CHECK_IN_STATUSES, EMRANK_ENDPOINTS } from "./constants"
import { fetchEmRankIdentity } from "./identity"
import {
  emRankCount,
  invalidEmRankResponse,
  readEmRank,
  withEmRankSession,
} from "./transport"

export type EmRankCheckInRecord = {
  day: string
  reward: number
}

/** EMRank reports the whole state as one authoritative object. */
export type EmRankCheckInState = {
  available: boolean
  canClaim: boolean
  status: string
  message: string
  today: string
  /** Present only once the site recorded a claim for the current day. */
  record: EmRankCheckInRecord | null
}

/** Read one day's reward row without treating a missing row as zero. */
function parseRecordRow(value: unknown, endpoint: string): EmRankCheckInRecord {
  if (
    !isRecord(value) ||
    typeof value.day !== "string" ||
    (typeof value.reward !== "string" && typeof value.reward !== "number")
  )
    invalidEmRankResponse(endpoint)
  return { day: value.day, reward: emRankCount(value.reward, endpoint) }
}

/** Validates one status payload before any claim decision is made from it. */
function readState(
  body: Record<string, unknown>,
  endpoint: string,
): EmRankCheckInState {
  const state = body.state
  if (
    typeof body.available !== "boolean" ||
    !isRecord(state) ||
    typeof state.can_claim !== "boolean" ||
    typeof state.status !== "string" ||
    typeof body.today !== "string"
  )
    invalidEmRankResponse(endpoint)
  if (
    state.record !== undefined &&
    state.record !== null &&
    !isRecord(state.record)
  )
    invalidEmRankResponse(endpoint)
  return {
    available: body.available,
    canClaim: state.can_claim,
    status: state.status,
    message: typeof state.message === "string" ? state.message : "",
    today: body.today,
    record:
      state.record === undefined || state.record === null
        ? null
        : parseRecordRow(state.record, endpoint),
  }
}

/**
 * Read the authoritative check-in state.
 *
 * `state.can_claim` gates the claim; `state.status` distinguishes `ready`
 * from `already_claimed`. `today` is the site's own (Asia/Shanghai) day key.
 */
export async function fetchCheckInState(
  request: ApiServiceRequest,
): Promise<EmRankCheckInState> {
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const endpoint = EMRANK_ENDPOINTS.CheckIn
    return readState(await readEmRank(scoped, endpoint), endpoint)
  })
}

export type EmRankCheckInResult = {
  alreadyChecked: boolean
  message: string
  record: EmRankCheckInRecord | null
}

/**
 * Claim once after the authoritative state says the day is open.
 *
 * A repeat POST answers `already_claimed` with the day's record and does not
 * grant twice (verified 2026-10-16 on the live deployment), so a state read
 * that already says claimed short-circuits before the write. The awarded M
 * Token credit has no published cash conversion, so the caller preserves the
 * site's own message/record for a native asset reward.
 */
export async function performCheckIn(
  request: ApiServiceRequest,
): Promise<EmRankCheckInResult> {
  return withEmRankSession(request, async (scoped) => {
    const endpoint = EMRANK_ENDPOINTS.CheckIn
    await fetchEmRankIdentity(scoped)
    const before = readState(await readEmRank(scoped, endpoint), endpoint)
    if (!before.available)
      throw new ApiError(
        "EMRank check-in is unavailable",
        undefined,
        endpoint,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      )
    if (before.status === EMRANK_CHECK_IN_STATUSES.AlreadyClaimed) {
      return {
        alreadyChecked: true,
        message: before.message,
        record: before.record,
      }
    }
    if (!before.canClaim) {
      // A non-claimable state that is not today's claim is an upstream refusal:
      // surface the site's own message instead of reporting a success.
      throw new ApiError(
        before.message || "EMRank check-in is not open",
        undefined,
        endpoint,
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    }
    const response = await readEmRank(scoped, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (!isRecord(response.record)) invalidEmRankResponse(endpoint)
    // The POST answers with the post-claim state (`already_claimed` is reported
    // even on a fresh claim), so the pre-POST readiness decides the outcome.
    return {
      alreadyChecked: false,
      message: typeof response.message === "string" ? response.message : "",
      record: parseRecordRow(response.record, endpoint),
    }
  })
}
