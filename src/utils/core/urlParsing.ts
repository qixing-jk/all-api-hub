type NormalizeUrlForOriginKeyOptions = {
  lowerCase?: boolean
  stripTrailingSlashes?: boolean
}

/**
 * Strips the search and hash components from a URL string.
 * @param value - The URL string to process.
 */
function stripUrlSearchAndHash(value: string): string {
  return value.replace(/[?#].*$/, "")
}

/**
 * Converts a URL object to a normalized string representation.
 * @param url - The URL object to convert.
 */
function toNormalizedUrlString(url: URL): string {
  return url.pathname === "/" ? url.origin : url.toString().replace(/\/+$/, "")
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
 * Normalizes a pathname by trimming trailing slashes and collapsing empty values to `/`.
 */
export function normalizeUrlPathname(
  pathname: string | undefined | null,
): string {
  return (pathname ?? "").replace(/\/+$/, "") || "/"
}

/**
 * Normalizes a base URL-like string for shared path handling.
 *
 * - For valid absolute URLs: strips query/hash, trims trailing slashes, and preserves
 *   origin plus normalized pathname.
 * - Otherwise: returns the trimmed input without query/hash or trailing slashes.
 */
export function normalizeUrlForBasePath(
  value: string | undefined | null,
): string {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return ""

  const parsed = tryParseUrl(trimmed)
  if (!parsed) {
    return stripUrlSearchAndHash(trimmed).replace(/\/+$/, "")
  }

  parsed.search = ""
  parsed.hash = ""
  parsed.pathname = normalizeUrlPathname(parsed.pathname)

  return toNormalizedUrlString(parsed)
}

/**
 * Transforms the path portion of a base URL-like string while preserving the normalized origin.
 *
 * For non-URL inputs, the transform is applied to the normalized input string directly.
 */
export function transformNormalizedUrlPath(
  value: string | undefined | null,
  transform: (pathname: string) => string,
): string {
  const normalizedValue = normalizeUrlForBasePath(value)
  if (!normalizedValue) return ""

  const parsed = tryParseUrl(normalizedValue)
  if (!parsed) {
    return transform(normalizedValue)
  }

  parsed.pathname = normalizeUrlPathname(
    transform(normalizeUrlPathname(parsed.pathname)),
  )

  return toNormalizedUrlString(parsed)
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
