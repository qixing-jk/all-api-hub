import type { ApiToken } from "~/types"

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
