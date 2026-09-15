import type { AccountSiteType } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"

/**
 * Normalizes a raw token key string without changing the backend-provided
 * token shape.
 *
 * Do not synthesize an `sk-` prefix here. Some backends store and return raw
 * keys, and upstream `new-api` accepts an optional `sk-` prefix at auth time
 * while persisting the underlying key without it
 * (`controller/token.go:GetTokenUsage` trims `sk-` before lookup).
 */
export function normalizeApiTokenKeyValue(key: string): string {
  return key.trim()
}

/**
 * Returns true for One/New API-family site types whose token identity accepts
 * either raw keys or a single `sk-` prefix, while user-facing auth/export
 * values should be OpenAI-compatible `sk-...` keys.
 */
export function hasOptionalSkPrefixSiteTokenSemantics(
  siteType?: AccountSiteType | string,
): boolean {
  return siteType
    ? getAccountSiteDefinition(siteType)?.tokenKey?.optionalSkPrefix === true
    : false
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
 * Normalizes a provider key record without changing its native fields.
 */
export function normalizeApiTokenKey<T extends { key: string }>(token: T): T {
  if (!token || typeof token.key !== "string") return token

  const normalizedKey = normalizeApiTokenKeyValue(token.key)
  if (normalizedKey === token.key) return token
  return { ...token, key: normalizedKey }
}

/** Validates stable positive identities across a complete token inventory. */
export function validateApiTokenInventory<T extends { id: number }>(
  tokens: T[],
): T[] {
  const tokenIds = new Set<number>()

  for (const token of tokens) {
    if (!Number.isSafeInteger(token.id) || token.id <= 0) {
      throw new Error("invalid_token_id")
    }
    if (tokenIds.has(token.id)) throw new Error("duplicate_token_id")
    tokenIds.add(token.id)
  }

  return tokens
}
