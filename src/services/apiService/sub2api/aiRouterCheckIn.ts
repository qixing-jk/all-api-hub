import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

import {
  AI_ROUTER_DAILY_CHECK_IN_ENDPOINT,
  createAiRouterCheckInStatusEndpoint,
} from "./aiRouterCheckInProtocol"
import { executeAuthenticatedSub2ApiRequest } from "./authLifecycle"

/**
 * AI-ROUTER (`https://ai-router.dev`) is a Sub2API fork that keeps the host's
 * `{ code, message, data }` envelope and bearer session but replaces the daily
 * check-in protocol. It serves one route for both directions:
 *
 * - `GET  /api/v1/user/daily-checkin` reads today's state.
 * - `POST /api/v1/user/daily-checkin` claims it (no request body).
 *
 * Neither upstream's Sub2API Pro route (`/api/v1/redeem/checkin`) nor the other
 * registered forks' routes exist here; the deployment answers them with
 * `404 page not found`.
 * Verified against the live deployment on 2026-09-27 and recorded in
 * `.scratch/ai-router-adaptation/research.md`.
 *
 * The deployment is served on a different origin than its API. Requests built
 * from the account URL are routed to the API origin by the shared transport, so
 * this module addresses the path only.
 */

export { AI_ROUTER_DAILY_CHECK_IN_ENDPOINT } from "./aiRouterCheckInProtocol"

/**
 * The fork refuses a repeat claim with HTTP 409 and this reason. The claim is
 * idempotent per user per day: the observed duplicate left the balance
 * unchanged.
 */
export const AI_ROUTER_DAILY_CHECK_IN_ERROR_REASONS = {
  AlreadyClaimed: "DAILY_CHECKIN_CLAIMED",
  Restricted: "DAILY_CHECKIN_RESTRICTED",
} as const

export const AI_ROUTER_STATUS_OUTCOMES = {
  Matched: "matched",
  /** The deployment answered, but does not serve this app. */
  Absent: "absent",
  /** The deployment could not be read authoritatively. */
  Unknown: "unknown",
} as const

export type AiRouterStatusProbe =
  | {
      outcome: typeof AI_ROUTER_STATUS_OUTCOMES.Matched
      status: { enabled: boolean; checkedInToday: boolean }
    }
  | { outcome: typeof AI_ROUTER_STATUS_OUTCOMES.Absent }
  | {
      outcome: typeof AI_ROUTER_STATUS_OUTCOMES.Unknown
      reason:
        | "authentication_required"
        | "permission_denied"
        | "invalid_response"
    }

export const AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: "applied",
  AlreadyChecked: "already_checked",
} as const

export type AiRouterDailyCheckInResult =
  | {
      kind: typeof AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied
      data: { rewardAmount: number }
    }
  | {
      kind: typeof AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked
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

/** Reads the deployment's decimal amounts, which mix numbers and strings. */
const toAmount = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    const amount = Number(value.trim())
    return Number.isFinite(amount) ? amount : null
  }
  return null
}

const invalidResponse = (endpoint: string): ApiError =>
  new ApiError(
    "Invalid AI-ROUTER daily check-in response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

const createHttpError = (response: ApiTransportResponse<string>): ApiError => {
  const envelope = toRecord(tryParseJson(response.body))
  const message =
    typeof envelope?.message === "string" && envelope.message.trim()
      ? envelope.message.trim()
      : `AI-ROUTER daily check-in request failed with HTTP ${response.status}`

  return new ApiError(
    message,
    response.status,
    AI_ROUTER_DAILY_CHECK_IN_ENDPOINT,
    response.status === 401
      ? API_ERROR_CODES.HTTP_401
      : response.status === 403
        ? API_ERROR_CODES.HTTP_403
        : response.status === 429
          ? API_ERROR_CODES.HTTP_429
          : API_ERROR_CODES.HTTP_OTHER,
  )
}

const readFailureReason = (body: string): string => {
  const reason = toRecord(tryParseJson(body))?.reason
  return typeof reason === "string" ? reason : ""
}

const classifyStatusResponse = (
  response: ApiTransportResponse<string>,
): AiRouterStatusProbe => {
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) {
      return { outcome: AI_ROUTER_STATUS_OUTCOMES.Absent }
    }
    if (response.status === 401) {
      return {
        outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
        reason: "authentication_required",
      }
    }
    if (response.status === 403) {
      return {
        outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
        reason: "permission_denied",
      }
    }
    return {
      outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
      reason: "invalid_response",
    }
  }

  const parsed = tryParseJson(response.body)
  if (parsed === undefined) {
    // A deployment that does not serve this API answers with its own app shell,
    // which identifies the host rather than an instance of this app.
    return { outcome: AI_ROUTER_STATUS_OUTCOMES.Absent }
  }

  const envelope = toRecord(parsed)
  if (envelope?.code !== 0 || typeof envelope.message !== "string") {
    return {
      outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
      reason: "invalid_response",
    }
  }

  const data = toRecord(envelope.data)
  if (
    !data ||
    typeof data.enabled !== "boolean" ||
    typeof data.checked_today !== "boolean" ||
    (data.eligible !== undefined && typeof data.eligible !== "boolean")
  ) {
    return {
      outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
      reason: "invalid_response",
    }
  }

  return {
    outcome: AI_ROUTER_STATUS_OUTCOMES.Matched,
    status: {
      // The deployment gates the reward behind an account-age check and its own
      // dashboard refuses to submit while the account is not eligible, so an
      // ineligible account cannot claim today.
      enabled: data.enabled && data.eligible !== false,
      checkedInToday: data.checked_today,
    },
  }
}

/**
 * Reads today's state without mutating it. 404/405 and a non-JSON success body
 * are ordinary negatives: they mean this deployment does not serve the app.
 * Authentication failures, server errors, transport failures and a JSON body
 * with an unexpected shape stay unknown.
 */
export async function probeAiRouterDailyCheckInStatus(
  request: ApiServiceRequest,
): Promise<AiRouterStatusProbe> {
  return executeAuthenticatedSub2ApiRequest(
    request,
    AI_ROUTER_DAILY_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<string>(authenticatedRequest, {
        endpoint: createAiRouterCheckInStatusEndpoint(),
        options: { method: "GET", cache: "no-store" },
        responseType: "text",
      })
      return classifyStatusResponse(response)
    },
    { proactiveRefresh: false, recoverUnauthorized: false },
  )
}

const parseClaimResponse = (
  response: ApiTransportResponse<string>,
): AiRouterDailyCheckInResult => {
  if (!response.ok) {
    if (
      response.status === 409 &&
      readFailureReason(response.body) ===
        AI_ROUTER_DAILY_CHECK_IN_ERROR_REASONS.AlreadyClaimed
    ) {
      return { kind: AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked }
    }
    throw createHttpError(response)
  }

  const envelope = toRecord(tryParseJson(response.body))
  if (envelope?.code !== 0 || typeof envelope.message !== "string") {
    throw invalidResponse(AI_ROUTER_DAILY_CHECK_IN_ENDPOINT)
  }

  // The deployment's dashboard assigns this payload to the same check-in state
  // its status read populates, so an accepted claim answers with the day's new
  // state rather than a mutation-only DTO.
  const data = toRecord(envelope.data)
  if (!data || data.checked_today !== true) {
    throw invalidResponse(AI_ROUTER_DAILY_CHECK_IN_ENDPOINT)
  }

  const rewardAmount = toAmount(data.reward_amount)
  if (rewardAmount === null) {
    throw invalidResponse(AI_ROUTER_DAILY_CHECK_IN_ENDPOINT)
  }

  return {
    kind: AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    data: { rewardAmount },
  }
}

/**
 * Submits once, after the caller has confirmed today's state. No request body
 * and no client fingerprint are sent: the deployment's own dashboard omits the
 * optional `X-AI-Router-Client-Fingerprint` header whenever its fingerprint
 * lookup misses, and a claim without it still reaches the day gate.
 *
 * Unverified backend replay guarantees: a dispatched failure is left to the
 * caller's status reconciliation instead of replaying the write here.
 */
export async function performAiRouterDailyCheckIn(
  request: ApiServiceRequest,
): Promise<AiRouterDailyCheckInResult> {
  return executeAuthenticatedSub2ApiRequest(
    request,
    AI_ROUTER_DAILY_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<string>(authenticatedRequest, {
        endpoint: AI_ROUTER_DAILY_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
        responseType: "text",
      })
      return parseClaimResponse(response)
    },
    { recoverUnauthorized: false },
  )
}
