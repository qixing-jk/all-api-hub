import { escapeRegExp } from "lodash-es"

/**
 * Creates a RegExp pattern string that matches any URL under the same origin as `url`.
 *
 * Example:
 * - input:  https://example.com/path
 * - output: ^https:\/\/example\.com(?:[/?#].*)?$
 *
 * Returns null when `url` is not a valid absolute URL.
 */
export function buildOriginWhitelistPattern(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const origin = parsed.origin
    if (!origin) return null
    const escaped = escapeRegExp(origin)
    return `^${escaped}(?:[/?#].*)?$`
  } catch {
    return null
  }
}

/**
 * Creates a RegExp pattern string that matches the URL prefix (origin + path) of `url`.
 *
 * The pattern ignores query/hash and allows additional suffixes like:
 * - trailing slash
 * - query string
 * - hash
 *
 * Returns null when `url` is not a valid absolute URL.
 */
export function buildUrlPrefixWhitelistPattern(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "")
    if (!normalized) return null
    const escaped = escapeRegExp(normalized)
    return `^${escaped}(?:[/?#].*)?$`
  } catch {
    return null
  }
}

/**
 * Tests whether `url` matches any provided RegExp pattern string.
 *
 * - Invalid patterns are ignored (treated as non-matching).
 * - Patterns are compiled with the `i` flag to keep behavior consistent across browsers.
 */
export function isUrlAllowedByRegexList(
  url: string,
  patterns: string[],
): boolean {
  const candidate = (url ?? "").trim()
  if (!candidate) return false

  for (const raw of patterns ?? []) {
    const pattern = (raw ?? "").trim()
    if (!pattern) continue
    try {
      const regex = new RegExp(pattern, "i")
      if (regex.test(candidate)) return true
    } catch {
      // Ignore invalid patterns.
    }
  }

  return false
}
