import { UI_CONSTANTS } from "~/constants/ui"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { extractItemsFromArrayOrItemsPayload } from "~/services/apiTransport/pagination"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayStatsAvailability,
} from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { toOptionalFiniteNumber } from "~/utils/core/number"
import { t } from "~/utils/i18n/core"

import { readSub2ApiFailureEnvelope } from "./responseError"
import type {
  Sub2ApiAuthMeData,
  Sub2ApiEnvelope,
  Sub2ApiGroupData,
  Sub2ApiGroupDescriptor,
  Sub2ApiKeyData,
  Sub2ApiKeyListData,
  Sub2ApiNativeKey,
  Sub2ApiUsageStatsData,
} from "./type"

const getInvalidResponseMessage = () =>
  t("messages:errors.api.invalidResponseFormat")

const createInvalidResponseError = (endpoint: string) =>
  new ApiError(
    getInvalidResponseMessage(),
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

const toObjectRecord = <T extends object>(
  value: unknown,
  endpoint: string,
): T => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createInvalidResponseError(endpoint)
  }

  return value as T
}

type Sub2ApiUserIdentity = {
  userId: number
  username: string
  balanceUsd: number
  quota: number
}

type Sub2ApiTodayUsage = {
  today_quota_consumption: number
  today_prompt_tokens: number
  today_completion_tokens: number
  today_requests_count: number
  todayStatsAvailability: Pick<
    AccountTodayStatsAvailability,
    "consumption" | "requests" | "tokens"
  >
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

const toTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

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

const parseSub2ApiKeyGroup = (payload: Partial<Sub2ApiKeyData>): string => {
  const nestedGroup = payload.group ?? payload.Group
  const nestedName = toTrimmedString(nestedGroup?.name)
  if (nestedName) return nestedName

  return ""
}

const parseSub2ApiKeyGroupId = (
  payload: Partial<Sub2ApiKeyData>,
): number | undefined => {
  const explicitGroupId = toFiniteIntegerOrNull(payload.group_id)
  if (explicitGroupId !== null) {
    return explicitGroupId
  }

  return undefined
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
  const endpoint = "/api/v1/auth/me"
  const data = toObjectRecord<Partial<Sub2ApiAuthMeData>>(payload, endpoint)
  const userId = toFiniteIntegerOrNull(data.id)
  const rawUsername = typeof data.username === "string" ? data.username : ""
  const rawEmail = typeof data.email === "string" ? data.email : ""
  const username = getSub2ApiDisplayName(rawUsername, rawEmail)
  if (userId === null) {
    throw createInvalidResponseError(endpoint)
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
export const parseSub2ApiEnvelope = <T>(
  body: unknown,
  endpoint: string,
  options?: { allowMissingData?: boolean },
): T => {
  const invalidResponseMessage = getInvalidResponseMessage()
  const envelope = toObjectRecord<Partial<Sub2ApiEnvelope<T>>>(body, endpoint)

  if (typeof envelope.code !== "number") {
    throw createInvalidResponseError(endpoint)
  }

  if (typeof envelope.message !== "string") {
    throw createInvalidResponseError(endpoint)
  }

  if (envelope.code !== 0) {
    const failure = readSub2ApiFailureEnvelope(envelope)
    const message = getErrorMessage(failure?.message, invalidResponseMessage)
    throw new ApiError(
      message,
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
      failure?.upstreamCode,
    )
  }

  if (envelope.data === undefined && !options?.allowMissingData) {
    throw createInvalidResponseError(endpoint)
  }

  return envelope.data as T
}

export const extractSub2ApiKeyItems = (
  payload: Sub2ApiKeyListData,
): Sub2ApiKeyData[] => extractItemsFromArrayOrItemsPayload(payload)

/** Keep native key fields while validating identities used by resource operations. */
export function parseSub2ApiNativeKey(
  payload: unknown,
  options?: { defaultUserId?: number | string; endpoint?: string },
): Sub2ApiNativeKey {
  const endpoint = options?.endpoint ?? "/api/v1/keys"
  const data = toObjectRecord<Sub2ApiKeyData>(payload, endpoint)
  const id = toFiniteIntegerOrNull(data.id)
  if (id === null || !Number.isSafeInteger(id) || id <= 0)
    throw createInvalidResponseError(endpoint)
  return {
    ...data,
    id,
    user_id: data.user_id ?? options?.defaultUserId,
    key: toTrimmedString(data.key),
    name: toTrimmedString(data.name),
    group_id: parseSub2ApiKeyGroupId(data),
    group_name: parseSub2ApiKeyGroup(data),
  }
}

/**
 * Parse Sub2API user usage stats from `/api/v1/usage/stats?period=today`.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * User usage stats return cost fields in USD (`total_actual_cost`) and token
 * counts as plain totals under the authenticated `/api/v1/usage/stats` route.
 */
export const parseSub2ApiTodayUsage = (
  payload: unknown,
  endpoint: string,
): Sub2ApiTodayUsage => {
  const data = toObjectRecord<Partial<Sub2ApiUsageStatsData>>(payload, endpoint)
  const cost = toOptionalFiniteNumber(data.total_actual_cost)
  const requests = toOptionalFiniteNumber(data.total_requests)
  const inputTokens = toOptionalFiniteNumber(data.total_input_tokens)
  const outputTokens = toOptionalFiniteNumber(data.total_output_tokens)
  const complete = { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete } as const
  const invalid = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
  } as const
  const tokenAvailability =
    inputTokens !== undefined && outputTokens !== undefined
      ? complete
      : inputTokens !== undefined || outputTokens !== undefined
        ? {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
          }
        : invalid

  return {
    today_quota_consumption: convertUsdBalanceToQuota(cost ?? 0),
    today_prompt_tokens: Math.max(0, Math.trunc(inputTokens ?? 0)),
    today_completion_tokens: Math.max(0, Math.trunc(outputTokens ?? 0)),
    today_requests_count: Math.max(0, Math.trunc(requests ?? 0)),
    todayStatsAvailability: {
      consumption: cost === undefined ? invalid : complete,
      requests: requests === undefined ? invalid : complete,
      tokens: tokenAvailability,
    },
  }
}

const parseSub2ApiGroupList = (
  payload: unknown,
  endpoint: string,
): Sub2ApiGroupData[] => {
  if (!Array.isArray(payload)) {
    throw createInvalidResponseError(endpoint)
  }

  return payload.map((item) => {
    if (!item || typeof item !== "object") {
      throw createInvalidResponseError(endpoint)
    }
    return item as Sub2ApiGroupData
  })
}

export const parseSub2ApiGroupRates = (
  payload: unknown,
  endpoint: string,
): Record<string, number> => {
  const rates = toObjectRecord<Record<string, unknown>>(payload, endpoint)

  return Object.entries(rates).reduce(
    (accumulator, [key, value]) => {
      const numericValue = toFiniteNumberOrZero(value)
      accumulator[key] = numericValue > 0 ? numericValue : 1
      return accumulator
    },
    {} as Record<string, number>,
  )
}

const toSub2ApiGroupDescriptor = (
  group: Sub2ApiGroupData,
  rates: Record<string, number>,
): Sub2ApiGroupDescriptor | null => {
  const displayName = toTrimmedString(group.name)
  const id = toFiniteIntegerOrNull(group.id)
  if (!displayName || id === null || !Number.isSafeInteger(id)) return null

  return {
    id,
    displayName,
    description: toTrimmedString(group.description) || displayName,
    ratio:
      rates[String(id)] || toFiniteNumberOrZero(group.rate_multiplier) || 1,
  }
}

export const buildSub2ApiGroupDescriptors = (
  groupsPayload: unknown,
  ratesPayload: unknown,
  endpoints?: { groups?: string; rates?: string },
): Sub2ApiGroupDescriptor[] => {
  const groupsEndpoint = endpoints?.groups ?? "/api/v1/groups/available"
  const groups = parseSub2ApiGroupList(groupsPayload, groupsEndpoint)
  const rates = parseSub2ApiGroupRates(
    ratesPayload,
    endpoints?.rates ?? "/api/v1/groups/rates",
  )
  const seenIds = new Set<number>()

  return groups.map((group) => {
    const descriptor = toSub2ApiGroupDescriptor(group, rates)
    if (!descriptor) {
      throw createInvalidResponseError(groupsEndpoint)
    }
    if (seenIds.has(descriptor.id)) {
      throw createInvalidResponseError(groupsEndpoint)
    }
    seenIds.add(descriptor.id)
    return descriptor
  })
}
