import i18next from "i18next"

import { UI_CONSTANTS } from "~/constants/ui"
import { normalizeApiTokenKey } from "~/services/apiService/common/apiKey"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import { extractItemsFromArrayOrItemsPayload } from "~/services/apiService/common/pagination"
import type {
  CreateTokenRequest,
  UserGroupInfo,
} from "~/services/apiService/common/type"
import type { ApiToken } from "~/types"

import type {
  Sub2ApiAuthMeData,
  Sub2ApiCreateKeyPayload,
  Sub2ApiEnvelope,
  Sub2ApiGroupData,
  Sub2ApiKeyData,
  Sub2ApiKeyListData,
  Sub2ApiKeyWritePayloadBase,
  Sub2ApiUpdateKeyPayload,
} from "./type"

const SHARED_UNLIMITED_EXPIRED_TIME = -1
const MS_PER_DAY = 24 * 60 * 60 * 1000

const getInvalidResponseMessage = () =>
  i18next.t("messages:errors.api.invalidResponseFormat")

const createInvalidResponseError = (endpoint: string) =>
  new ApiError(getInvalidResponseMessage(), undefined, endpoint)

const toObjectRecord = <T extends object>(
  value: unknown,
  endpoint: string,
): T => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createInvalidResponseError(endpoint)
  }

  return value as T
}

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

const toParsedEpochSeconds = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null
    return value > 1_000_000_000_000
      ? Math.floor(value / 1000)
      : Math.floor(value)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null

    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      if (numeric <= 0) return null
      return numeric > 1_000_000_000_000
        ? Math.floor(numeric / 1000)
        : Math.floor(numeric)
    }

    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000)
    }
  }

  return null
}

const toOptionalEpochSeconds = (value: unknown): number => {
  return toParsedEpochSeconds(value) ?? SHARED_UNLIMITED_EXPIRED_TIME
}

const toTimestampEpochSecondsOrNaN = (value: unknown): number => {
  return toParsedEpochSeconds(value) ?? Number.NaN
}

const normalizeIpWhitelist = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => toTrimmedString(item)).filter(Boolean)
  }

  const raw = toTrimmedString(value)
  if (!raw) return []

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

const parseSub2ApiKeyGroup = (payload: Partial<Sub2ApiKeyData>): string => {
  const nestedGroup = payload.group ?? payload.Group
  const nestedName = toTrimmedString(nestedGroup?.name)
  if (nestedName) return nestedName

  return ""
}

/**
 * Convert a USD balance (Sub2API) into the extension's internal quota unit.
 */
export const convertUsdBalanceToQuota = (balanceUsd: number): number => {
  const safe = Number.isFinite(balanceUsd) && balanceUsd > 0 ? balanceUsd : 0
  return Math.round(safe * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)
}

/**
 * Convert a shared internal quota value back into Sub2API's USD quota value.
 */
export const convertQuotaToUsdAmount = (quota: number): number => {
  const safe = Number.isFinite(quota) && quota > 0 ? quota : 0
  return Number(
    (safe / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR).toFixed(6),
  )
}

export const convertExpirySecondsToSub2ApiDays = (
  expiredTime: number,
  nowMs: number = Date.now(),
): number => {
  if (!Number.isFinite(expiredTime) || expiredTime <= 0) {
    return 0
  }

  const msUntilExpiry = expiredTime * 1000 - nowMs
  if (msUntilExpiry <= 0) {
    return 0
  }

  return Math.ceil(msUntilExpiry / MS_PER_DAY)
}

export const toSub2ApiIsoTimestamp = (expiredTime: number): string => {
  if (!Number.isFinite(expiredTime) || expiredTime <= 0) {
    return ""
  }

  return new Date(expiredTime * 1000).toISOString()
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
    throw new ApiError(invalidResponseMessage, undefined, endpoint)
  }

  if (typeof envelope.message !== "string") {
    throw new ApiError(invalidResponseMessage, undefined, endpoint)
  }

  if (envelope.code !== 0) {
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

  if (envelope.data === undefined && !options?.allowMissingData) {
    throw new ApiError(invalidResponseMessage, undefined, endpoint)
  }

  return envelope.data as T
}

export const parseSub2ApiKeyStatus = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value === 1 ? 1 : 0
  }

  return toTrimmedString(value).toLowerCase() === "active" ? 1 : 0
}

export const extractSub2ApiKeyItems = (
  payload: Sub2ApiKeyListData,
): Sub2ApiKeyData[] => extractItemsFromArrayOrItemsPayload(payload)

export const parseSub2ApiKey = (
  payload: unknown,
  options?: { defaultUserId?: number | string; endpoint?: string },
): ApiToken => {
  const endpoint = options?.endpoint ?? "/api/v1/keys"
  const data = toObjectRecord<Partial<Sub2ApiKeyData>>(payload, endpoint)
  const id = toFiniteIntegerOrNull(data.id)
  const userId =
    toFiniteIntegerOrNull(data.user_id) ??
    toFiniteIntegerOrNull(options?.defaultUserId)

  if (id === null || userId === null) {
    throw createInvalidResponseError(endpoint)
  }

  const totalQuotaUsd = toFiniteNumberOrZero(data.quota)
  const usedQuotaUsd = toFiniteNumberOrZero(data.quota_used)
  const unlimitedQuota = totalQuotaUsd <= 0
  const remainQuotaUsd = unlimitedQuota
    ? 0
    : Math.max(totalQuotaUsd - usedQuotaUsd, 0)

  return normalizeApiTokenKey({
    id,
    user_id: userId,
    key: toTrimmedString(data.key),
    status: parseSub2ApiKeyStatus(data.status),
    name: toTrimmedString(data.name),
    created_time: toTimestampEpochSecondsOrNaN(data.created_at),
    accessed_time: toTimestampEpochSecondsOrNaN(data.updated_at),
    expired_time: toOptionalEpochSeconds(data.expires_at),
    remain_quota: unlimitedQuota
      ? -1
      : convertUsdBalanceToQuota(remainQuotaUsd),
    unlimited_quota: unlimitedQuota,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: normalizeIpWhitelist(data.ip_whitelist).join(","),
    used_quota: convertUsdBalanceToQuota(usedQuotaUsd),
    group: parseSub2ApiKeyGroup(data),
  })
}

export const parseSub2ApiGroupList = (
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
      accumulator[key] = numericValue || 1
      return accumulator
    },
    {} as Record<string, number>,
  )
}

export const buildSub2ApiUserGroups = (
  groupsPayload: unknown,
  ratesPayload: unknown,
  endpoints?: { groups?: string; rates?: string },
): Record<string, UserGroupInfo> => {
  const groups = parseSub2ApiGroupList(
    groupsPayload,
    endpoints?.groups ?? "/api/v1/groups/available",
  )
  const rates = parseSub2ApiGroupRates(
    ratesPayload,
    endpoints?.rates ?? "/api/v1/groups/rates",
  )

  return groups.reduce(
    (accumulator, group) => {
      const groupName = toTrimmedString(group.name)
      const groupId = toFiniteIntegerOrNull(group.id)

      if (!groupName || groupId === null) {
        return accumulator
      }

      accumulator[groupName] = {
        desc: toTrimmedString(group.description) || groupName,
        ratio:
          rates[String(groupId)] ||
          toFiniteNumberOrZero(group.rate_multiplier) ||
          1,
      }
      return accumulator
    },
    {} as Record<string, UserGroupInfo>,
  )
}

export const resolveSub2ApiGroupId = (
  groupsPayload: unknown,
  groupName: string,
  endpoint: string,
): number | undefined => {
  const normalizedGroup = groupName.trim()
  if (!normalizedGroup) return undefined

  const groups = parseSub2ApiGroupList(groupsPayload, endpoint)
  const match = groups.find(
    (group) => toTrimmedString(group.name) === normalizedGroup,
  )

  return match ? toFiniteIntegerOrNull(match.id) ?? undefined : undefined
}

const withOptionalGroupId = <T extends { group_id?: number }>(
  payload: T,
  groupId?: number,
): T => {
  if (typeof groupId === "number" && Number.isFinite(groupId)) {
    payload.group_id = groupId
  }

  return payload
}

const buildSub2ApiKeyWritePayloadBase = (
  tokenData: CreateTokenRequest,
): Sub2ApiKeyWritePayloadBase => ({
  name: tokenData.name.trim(),
  quota: tokenData.unlimited_quota
    ? 0
    : convertQuotaToUsdAmount(tokenData.remain_quota),
  ip_whitelist: normalizeIpWhitelist(tokenData.allow_ips),
})

export const translateSub2ApiCreateTokenRequest = (
  tokenData: CreateTokenRequest,
  groupId?: number,
  nowMs?: number,
): Sub2ApiCreateKeyPayload => {
  return withOptionalGroupId(
    {
      ...buildSub2ApiKeyWritePayloadBase(tokenData),
      expires_in_days:
        tokenData.expired_time > 0
          ? convertExpirySecondsToSub2ApiDays(tokenData.expired_time, nowMs)
          : 0,
    },
    groupId,
  )
}

export const translateSub2ApiUpdateTokenRequest = (
  tokenData: CreateTokenRequest,
  groupId?: number,
): Sub2ApiUpdateKeyPayload => {
  return withOptionalGroupId(
    {
      ...buildSub2ApiKeyWritePayloadBase(tokenData),
      expires_at:
        tokenData.expired_time > 0
          ? toSub2ApiIsoTimestamp(tokenData.expired_time)
          : "",
    },
    groupId,
  )
}
