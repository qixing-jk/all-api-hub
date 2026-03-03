/**
 * Cookie header parsing and merging utilities.
 *
 * These helpers are used to compose per-request Cookie headers for multi-account
 * cookie authentication without mutating the browser's global cookie jar.
 */

export type CookieMap = Map<string, string>

/**
 * Normalizes a user-provided Cookie header value by stripping a leading
 * "Cookie:" prefix when present.
 */
export function normalizeCookieHeaderValue(value: string): string {
  if (!value) return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.replace(/^cookie\s*:\s*/i, "").trim()
}

/**
 * Parses a Cookie header string into a map.
 * @param header Raw Cookie header value (e.g. "a=1; b=2").
 * @returns Map of cookie name -> value.
 */
export function parseCookieHeader(header: string): CookieMap {
  const map: CookieMap = new Map()
  const normalized = normalizeCookieHeaderValue(header)
  if (!normalized) return map

  const parts = normalized.split(";")
  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (!part) continue

    const eqIndex = part.indexOf("=")
    if (eqIndex <= 0) continue

    const name = part.slice(0, eqIndex).trim()
    const value = part.slice(eqIndex + 1)
    if (!name) continue

    map.set(name, value)
  }

  return map
}

/**
 * Extracts only the "session" cookie from a Cookie header string.
 *
 * This is used for cookie-auth accounts: the persisted per-account cookie bundle
 * should only contain the session cookie, while WAF/other cookies are fetched
 * dynamically at request time.
 *
 * If no "session" cookie is present, this returns the normalized input string
 * unchanged (to avoid breaking sites that use a different session cookie name).
 */
export function extractSessionCookieHeader(header: string): string {
  const normalized = normalizeCookieHeaderValue(header)
  if (!normalized) return ""

  const parsed = parseCookieHeader(normalized)
  if (parsed.size === 0) return normalized

  for (const [name, value] of parsed.entries()) {
    if (name.trim().toLowerCase() === "session") {
      return `${name}=${value}`
    }
  }

  return normalized
}

/**
 * Serializes a cookie map to a Cookie header string.
 * @param cookies Map of cookie name -> value.
 * @returns Cookie header string.
 */
export function stringifyCookieHeader(cookies: CookieMap): string {
  if (!cookies || cookies.size === 0) return ""
  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")
}

/**
 * Merges two Cookie headers.
 * @param base Base cookie header (lowest priority).
 * @param override Override cookie header (highest priority).
 * @returns A merged Cookie header string.
 */
export function mergeCookieHeaders(base: string, override: string): string {
  const baseMap = parseCookieHeader(base)
  const overrideMap = parseCookieHeader(override)

  for (const [name, value] of overrideMap.entries()) {
    baseMap.set(name, value)
  }

  return stringifyCookieHeader(baseMap)
}
