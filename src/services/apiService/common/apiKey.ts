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
 * Normalizes an ApiToken so callers can safely assume `token.key` includes `sk-`.
 */
export function normalizeApiTokenKey(token: ApiToken): ApiToken {
  if (!token || typeof token.key !== "string") return token

  const normalizedKey = ensureSkPrefixedKey(token.key)
  if (normalizedKey === token.key) return token
  return { ...token, key: normalizedKey }
}
