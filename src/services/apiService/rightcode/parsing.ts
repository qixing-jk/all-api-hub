import { QUOTA_PER_USD } from "~/constants/money"
import type {
  RightCodeApiKey,
  RightCodeEffectiveUpstream,
  RightCodeOverallUsageStats,
  RightCodeSubscription,
  RightCodeSubscriptionSummary,
  RightCodeUsageStats,
  RightCodeUserInfo,
} from "~/services/apiService/rightcode/type"

export const toOptionalFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export const toFiniteNumber = (value: unknown, fallback = 0): number =>
  toOptionalFiniteNumber(value) ?? fallback

export const toOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

export const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : []

/**
 * Right Code reports USD amounts; AccountData balance and consumption fields
 * are stored as internal quota points.
 */
export const amountToQuota = (amount: number): number =>
  Math.round(amount * QUOTA_PER_USD)

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const isRightCodeUserInfo = (
  value: unknown,
): value is RightCodeUserInfo =>
  isRecord(value) &&
  typeof value.id === "number" &&
  typeof value.user_token === "string"

/**
 * The deployment only ever answers an authenticated read with the account
 * record, so a successful status plus this shape is the detection contract.
 */
export const isRightCodeKeyListPayload = (
  value: unknown,
): value is { keys: RightCodeApiKey[]; total?: number } =>
  isRecord(value) && Array.isArray(value.keys)

export const isRightCodeSubscriptionListPayload = (
  value: unknown,
): value is { subscriptions: RightCodeSubscription[]; total?: number } =>
  isRecord(value) && Array.isArray(value.subscriptions)

export const isRightCodeUsageStats = (
  value: unknown,
): value is RightCodeUsageStats =>
  isRecord(value) &&
  ("total_requests" in value ||
    "total_tokens" in value ||
    "total_cost" in value)

export const isRightCodeOverallUsageStats = (
  value: unknown,
): value is RightCodeOverallUsageStats => isRightCodeUsageStats(value)

export const isRightCodeSubscriptionSummary = (
  value: unknown,
): value is RightCodeSubscriptionSummary =>
  isRecord(value) &&
  ("total_quota" in value ||
    "remaining_quota" in value ||
    "used_quota" in value)

export const isRightCodeEffectiveUpstreamPayload = (
  value: unknown,
): value is { upstreams: RightCodeEffectiveUpstream[] } =>
  isRecord(value) && Array.isArray(value.upstreams)
