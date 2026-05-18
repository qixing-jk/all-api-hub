import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { ApiToken } from "~/types"

const OPTIONAL_SK_PREFIX_SITE_TYPES = new Set<string>([
  SITE_TYPES.ONE_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.ONE_HUB,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.V_API,
  SITE_TYPES.VO_API,
  SITE_TYPES.SUPER_API,
  SITE_TYPES.RIX_API,
  SITE_TYPES.NEO_API,
  SITE_TYPES.WONG_GONGYI,
])

/**
 * Normalizes a raw token key string without changing the backend-provided
 * token shape.
 *
 * Do not synthesize an `sk-` prefix here. Some backends store and return raw
 * keys, and upstream `new-api` accepts an optional `sk-` prefix at auth time
 * while persisting the underlying key without it
 * (`controller/token.go:GetTokenUsage` trims `sk-` before lookup).
 */
function normalizeApiTokenKeyText(key: string): string {
  return key.trim()
}

/**
 * Normalizes a raw token key string by trimming surrounding whitespace only.
 */
export function normalizeApiTokenKeyValue(key: string): string {
  return normalizeApiTokenKeyText(key)
}

/**
 * Returns true for One/New API-family site types whose token identity accepts
 * either raw keys or a single `sk-` prefix, while user-facing auth/export
 * values should be OpenAI-compatible `sk-...` keys.
 */
export function hasOptionalSkPrefixSiteTokenSemantics(
  siteType?: AccountSiteType | string,
): boolean {
  return siteType ? OPTIONAL_SK_PREFIX_SITE_TYPES.has(siteType) : false
}

/**
 * Formats a token key for auth/display/export boundaries for compatible site
 * types without changing the backend-provided raw key stored in inventory.
 */
export function formatOptionalSkPrefixSiteTokenAuthKey(
  key: string,
  siteType?: AccountSiteType | string,
): string {
  const normalizedKey = normalizeApiTokenKeyValue(key)
  if (!normalizedKey) return ""

  if (
    hasOptionalSkPrefixSiteTokenSemantics(siteType) &&
    !normalizedKey.startsWith("sk-")
  ) {
    return `sk-${normalizedKey}`
  }

  return normalizedKey
}

/**
 * Formats token identity when the caller already selected optional-`sk-`
 * comparison semantics.
 */
export function formatOptionalSkPrefixTokenComparableKey(key: string): string {
  const normalizedKey = normalizeApiTokenKeyValue(key)
  return normalizedKey.startsWith("sk-")
    ? normalizedKey.slice(3)
    : normalizedKey
}

/**
 * Formats token identity for compatible site-type comparisons where one
 * leading `sk-` prefix is optional.
 */
export function formatOptionalSkPrefixSiteTokenComparableKey(
  key: string,
  siteType?: AccountSiteType | string,
): string {
  const normalizedKey = normalizeApiTokenKeyValue(key)
  if (
    hasOptionalSkPrefixSiteTokenSemantics(siteType) &&
    normalizedKey.startsWith("sk-")
  ) {
    return formatOptionalSkPrefixTokenComparableKey(normalizedKey)
  }
  return normalizedKey
}

/**
 * Returns a transient token clone with an auth/display key for compatible site
 * types, preserving the caller's original token object when no change is
 * needed.
 */
export function formatOptionalSkPrefixSiteToken<TToken extends ApiToken>(
  token: TToken,
  siteType?: AccountSiteType | string,
): TToken {
  if (!token || typeof token.key !== "string") return token

  const authKey = formatOptionalSkPrefixSiteTokenAuthKey(token.key, siteType)
  return authKey === token.key ? token : { ...token, key: authKey }
}

/**
 * Detects inventory keys that are masked and therefore unusable as credentials.
 *
 * Upstream `new-api` currently replaces the middle of inventory keys with `*`.
 * Real OpenAI-style keys do not contain asterisks, so this safely identifies
 * the compatible masked-key contract.
 */
export function isMaskedApiTokenKey(key: string): boolean {
  const normalizedKey = normalizeApiTokenKeyValue(key)
  return normalizedKey.includes("*") || normalizedKey.includes("•")
}

/**
 * Returns true when the normalized token key can be used directly as a secret.
 */
export function hasUsableApiTokenKey(key: string): boolean {
  const normalizedKey = normalizeApiTokenKeyValue(key)
  return normalizedKey.length > 0 && !isMaskedApiTokenKey(normalizedKey)
}

/**
 * Normalizes an ApiToken so callers can rely on a trimmed key value.
 */
export function normalizeApiTokenKey(token: ApiToken): ApiToken {
  if (!token || typeof token.key !== "string") return token

  const normalizedKey = normalizeApiTokenKeyValue(token.key)
  if (normalizedKey === token.key) return token
  return { ...token, key: normalizedKey }
}
