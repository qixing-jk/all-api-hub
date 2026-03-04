import i18next from "i18next"

import { UI_CONSTANTS } from "~/constants/ui"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"

import type { Sub2ApiAuthMeData, Sub2ApiEnvelope } from "./type"

export type Sub2ApiUserIdentity = {
  userId: number
  username: string
  balanceUsd: number
  quota: number
}

/**
 * Sub2API UI display name fallback:
 * - Prefer `username` when present/non-empty
 * - Otherwise fall back to the local part of `email` (before "@")
 */
const getSub2ApiDisplayName = (username: string, email: string): string => {
  const normalizedUsername = username.trim()
  if (normalizedUsername) return normalizedUsername

  const normalizedEmail = email.trim()
  if (!normalizedEmail) return ""

  const atIndex = normalizedEmail.indexOf("@")
  return atIndex > 0 ? normalizedEmail.slice(0, atIndex) : normalizedEmail
}

const toFiniteNumberOrZero = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return 0
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const toFiniteIntegerOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isInteger(parsed) ? parsed : null
  }
  return null
}

/**
 * Convert a USD balance (Sub2API) into the extension's internal quota unit.
 */
export const convertUsdBalanceToQuota = (balanceUsd: number): number => {
  const safe = Number.isFinite(balanceUsd) && balanceUsd > 0 ? balanceUsd : 0
  return Math.round(safe * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)
}

/**
 * Parse Sub2API user identity shape from `/api/v1/auth/me` (or localStorage auth_user).
 */
export const parseSub2ApiUserIdentity = (
  payload: unknown,
): Sub2ApiUserIdentity => {
  const invalidResponseMessage = i18next.t(
    "messages:errors.api.invalidResponseFormat",
  )

  if (!payload || typeof payload !== "object") {
    throw new ApiError(invalidResponseMessage, undefined, "/api/v1/auth/me")
  }

  const data = payload as Partial<Sub2ApiAuthMeData>
  const userId = toFiniteIntegerOrNull(data.id)
  const rawUsername = typeof data.username === "string" ? data.username : ""
  const rawEmail = typeof data.email === "string" ? data.email : ""
  const username = getSub2ApiDisplayName(rawUsername, rawEmail)
  if (userId === null) {
    throw new ApiError(invalidResponseMessage, undefined, "/api/v1/auth/me")
  }

  const balanceUsd = toFiniteNumberOrZero(data.balance)

  return {
    userId,
    username,
    balanceUsd,
    quota: convertUsdBalanceToQuota(balanceUsd),
  }
}

/**
 * Parse `{ code, message, data }` envelope returned by Sub2API endpoints.
 *
 * Sub2API sometimes returns HTTP 200 with `code != 0` to indicate an error.
 * The `code` field is required and must be a number.
 * The `message` field is required and must be a string.
 */
export const parseSub2ApiEnvelope = <T>(body: unknown, endpoint: string): T => {
  const invalidResponseMessage = i18next.t(
    "messages:errors.api.invalidResponseFormat",
  )

  if (!body || typeof body !== "object") {
    throw new ApiError(invalidResponseMessage, undefined, endpoint)
  }

  const envelope = body as Partial<Sub2ApiEnvelope<T>>

  if (typeof envelope.code !== "number") {
    throw new ApiError(invalidResponseMessage, undefined, endpoint)
  }

  if (typeof envelope.message !== "string") {
    throw new ApiError(invalidResponseMessage, undefined, endpoint)
  }

  const code = envelope.code

  if (code !== 0) {
    const message = envelope.message.trim()
      ? envelope.message.trim()
      : invalidResponseMessage
    throw new ApiError(
      message,
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  if (envelope.data === undefined) {
    throw new ApiError(invalidResponseMessage, undefined, endpoint)
  }

  return envelope.data
}
