import type { ApiToken } from "~/types"

/**
 * Ensures API keys are consistently represented with an `sk-` prefix.
 *
 * The application treats upstream API tokens as OpenAI-style keys. Normalizing
 * them at ingestion time keeps UI and integrations free from scattered `sk-`
 * prefix handling.
 */
export function ensureSkPrefixedKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return trimmed
  return /^sk-/i.test(trimmed) ? trimmed : `sk-${trimmed}`
}

/**
 * Normalizes a raw token key string into the extension's canonical `sk-*` shape.
 */
export function normalizeApiTokenKeyValue(key: string): string {
  return ensureSkPrefixedKey(key)
}

/**
 * Detects inventory keys that are masked and therefore unusable as credentials.
 *
 * Upstream `new-api` currently replaces the middle of inventory keys with `*`.
 * Real OpenAI-style keys do not contain asterisks, so this safely identifies
 * the compatible masked-key contract.
 */
export function isMaskedApiTokenKey(key: string): boolean {
  return normalizeApiTokenKeyValue(key).includes("*")
}

/**
 * Returns true when the normalized token key can be used directly as a secret.
 */
export function hasUsableApiTokenKey(key: string): boolean {
  const normalizedKey = normalizeApiTokenKeyValue(key)
  return normalizedKey.length > 0 && !isMaskedApiTokenKey(normalizedKey)
}

/**
 * Normalizes an ApiToken so callers can safely assume `token.key` includes `sk-`.
 */
export function normalizeApiTokenKey(token: ApiToken): ApiToken {
  if (!token || typeof token.key !== "string") return token

  const normalizedKey = normalizeApiTokenKeyValue(token.key)
  if (normalizedKey === token.key) return token
  return { ...token, key: normalizedKey }
}
