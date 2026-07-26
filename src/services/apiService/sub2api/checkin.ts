/**
 * Sub2API daily check-in protocol helpers.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * Daily check-in is not part of upstream mainline. Deployments that carry the
 * feature expose it either as `/api/v1/redeem/checkin[/status]` (current fork
 * routing, registered next to the redemption routes) or as the older
 * `/api/v1/check-in[/status]` pair. Both shapes are attempted in that order and
 * a missing-route response on the first pair falls back to the second, so a
 * single account setting works across forks.
 *
 * This module stays free of transport/auth concerns: the caller owns request
 * execution (JWT hydration, refresh, re-sync) and feeds raw response bodies and
 * errors back in. That keeps the wire-format heuristics below unit-testable.
 */

import { ApiError } from "~/services/apiTransport/errors"

export interface Sub2ApiCheckinRoute {
  statusEndpoint: string
  checkinEndpoint: string
}

/**
 * Candidate check-in route pairs, tried in order.
 *
 * The `/api/v1/check-in` pair is first because it is the only variant observed
 * on a live deployment: an unauthenticated probe answered 401 (route present,
 * auth required) for both `GET /api/v1/check-in/status` and
 * `POST /api/v1/check-in`, while both `/api/v1/redeem/checkin` routes answered
 * the same bare `404 page not found` as a deliberately invented path. The
 * redeem-scoped pair is kept as a fallback for forks that register check-in next
 * to the redemption routes; ordering only affects which request is wasted first,
 * never correctness.
 */
export const SUB2API_CHECKIN_ROUTES: readonly Sub2ApiCheckinRoute[] = [
  {
    statusEndpoint: "/api/v1/check-in/status",
    checkinEndpoint: "/api/v1/check-in",
  },
  {
    statusEndpoint: "/api/v1/redeem/checkin/status",
    checkinEndpoint: "/api/v1/redeem/checkin",
  },
] as const

/**
 * Parsed view of a check-in status or check-in response.
 */
export interface Sub2ApiCheckinPayload {
  isCheckedInToday: boolean
  reward: string
  message: string
}

const CHECKED_FLAG_KEYS = new Set([
  "checked_in_today",
  "checked_today",
  "is_checked_in",
  "has_checked_in",
])

const CHECKED_DATE_KEYS = new Set([
  "checkin_date",
  "checked_in_at",
  "last_checkin_date",
  "last_checkin_at",
])

const REWARD_KEYS = new Set([
  "quota_awarded",
  "reward_amount",
  "reward",
  "amount",
  "credits_awarded",
])

const MESSAGE_KEYS = ["message", "msg", "detail", "error", "reason"] as const

const ALREADY_CHECKED_SNIPPETS = [
  "已签到",
  "已经签到",
  "重复签到",
  "already checked",
  "already check",
] as const

/**
 * HTTP statuses that mean "this deployment does not serve that route".
 */
const MISSING_ROUTE_STATUS_CODES = new Set([404, 405])

/**
 * Sub2API answers a repeated check-in with HTTP 409 on the fork that introduced
 * the redeem-scoped routing.
 */
const ALREADY_CHECKED_STATUS_CODE = 409

/**
 * Recursively locate the first value whose key matches one of `keys`.
 *
 * Deployments wrap check-in payloads inconsistently (bare object, single `data`
 * envelope, or a nested `data.status` object), so a depth-first key lookup is
 * more durable here than a fixed path.
 */
function findValue(value: unknown, keys: Set<string>): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, keys)
      if (found !== undefined) return found
    }
    return undefined
  }

  if (!value || typeof value !== "object") {
    return undefined
  }

  const record = value as Record<string, unknown>

  for (const [key, item] of Object.entries(record)) {
    if (keys.has(key.toLowerCase())) {
      return item
    }
  }

  for (const item of Object.values(record)) {
    const found = findValue(item, keys)
    if (found !== undefined) return found
  }

  return undefined
}

/**
 * Extract a human-readable backend message from an envelope or its `data`.
 */
export function extractSub2ApiCheckinMessage(body: unknown): string {
  if (!body || typeof body !== "object") return ""

  const record = body as Record<string, unknown>
  const sources: unknown[] = [record, record.data]

  for (const source of sources) {
    if (!source || typeof source !== "object") continue
    const sourceRecord = source as Record<string, unknown>

    for (const key of MESSAGE_KEYS) {
      const value = sourceRecord[key]
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
    }
  }

  return ""
}

/**
 * Detect an "already checked in today" outcome from backend copy.
 */
export function isSub2ApiAlreadyCheckedMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return ALREADY_CHECKED_SNIPPETS.some((snippet) =>
    normalized.includes(snippet.toLowerCase()),
  )
}

/**
 * Resolve today's check-in flag from a status/check-in payload.
 *
 * Order matters: an explicit boolean beats a date comparison, and free-text
 * matching is only a last resort for deployments that report neither.
 */
function resolveIsCheckedInToday(body: unknown, message: string): boolean {
  const flag = findValue(body, CHECKED_FLAG_KEYS)
  if (typeof flag === "boolean") return flag
  if (typeof flag === "number") return flag !== 0

  const lastCheckin = findValue(body, CHECKED_DATE_KEYS)
  if (typeof lastCheckin === "string" && lastCheckin.length >= 10) {
    const today = new Date().toISOString().slice(0, 10)
    if (lastCheckin.slice(0, 10) === today) return true
  }

  return isSub2ApiAlreadyCheckedMessage(message)
}

/**
 * Resolve the awarded amount, if the deployment reports one.
 */
function resolveReward(body: unknown): string {
  const reward = findValue(body, REWARD_KEYS)

  if (
    reward === undefined ||
    reward === null ||
    typeof reward === "boolean" ||
    typeof reward === "object"
  ) {
    return ""
  }

  return String(reward)
}

/**
 * Normalize a raw Sub2API check-in status or check-in response body.
 */
export function parseSub2ApiCheckinPayload(
  body: unknown,
): Sub2ApiCheckinPayload {
  const message = extractSub2ApiCheckinMessage(body)

  return {
    isCheckedInToday: resolveIsCheckedInToday(body, message),
    reward: resolveReward(body),
    message,
  }
}

/**
 * Whether an error means the deployment does not expose the attempted route.
 */
export function isSub2ApiMissingRouteError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    typeof error.statusCode === "number" &&
    MISSING_ROUTE_STATUS_CODES.has(error.statusCode)
  )
}

/**
 * Whether an error represents a repeated check-in rather than a failure.
 */
export function isSub2ApiAlreadyCheckedError(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.statusCode === ALREADY_CHECKED_STATUS_CODE) return true
    return isSub2ApiAlreadyCheckedMessage(error.message)
  }

  if (error instanceof Error) {
    return isSub2ApiAlreadyCheckedMessage(error.message)
  }

  return false
}
