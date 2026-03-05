export type NormalizeUrlForOriginKeyOptions = {
  lowerCase?: boolean
  stripTrailingSlashes?: boolean
}

/**
 * Best-effort parse for arbitrary URL strings.
 * Returns `null` when the input is empty or not a valid absolute URL.
 */
export function tryParseUrl(value: string | undefined | null): URL | null {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

/**
 * Best-effort origin extraction (scheme + host + optional port).
 * Returns `null` when the input is empty or not a valid absolute URL.
 */
export function tryParseOrigin(
  value: string | undefined | null,
): string | null {
  const parsed = tryParseUrl(value)
  return parsed ? parsed.origin : null
}

/**
 * Best-effort URL prefix extraction for matching/logging.
 * Returns `origin + pathname` (no query/hash), or `null` when invalid.
 */
export function tryParseUrlPrefix(
  value: string | undefined | null,
): string | null {
  const parsed = tryParseUrl(value)
  return parsed ? `${parsed.origin}${parsed.pathname}` : null
}

/**
 * Normalizes an arbitrary URL-like string into a stable origin key.
 *
 * - For valid absolute URLs: returns `origin` (scheme + host + optional port).
 * - Otherwise: returns the trimmed input (optionally stripping trailing slashes).
 *
 * Use this for comparisons / cache keys where different path/query fragments
 * should not produce different buckets.
 */
export function normalizeUrlForOriginKey(
  value: string | undefined | null,
  options: NormalizeUrlForOriginKeyOptions = {},
): string {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return ""

  const { lowerCase = false, stripTrailingSlashes = true } = options

  const origin = tryParseOrigin(trimmed)
  const fallback = stripTrailingSlashes ? trimmed.replace(/\/+$/, "") : trimmed
  const resolved = origin ?? fallback

  return lowerCase ? resolved.toLowerCase() : resolved
}
