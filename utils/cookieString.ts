/**
 * Cookie header parsing and merging utilities.
 *
 * These helpers are used to compose per-request Cookie headers for multi-account
 * cookie authentication without mutating the browser's global cookie jar.
 */

export type CookieMap = Map<string, string>

/**
 * Parses a Cookie header string into a map.
 * @param header Raw Cookie header value (e.g. "a=1; b=2").
 * @returns Map of cookie name -> value.
 */
export function parseCookieHeader(header: string): CookieMap {
  const map: CookieMap = new Map()
  if (!header) return map

  // Split by ';' but tolerate extra whitespace.
  const parts = header.split(";")
  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (!part) continue

    const eqIndex = part.indexOf("=")
    if (eqIndex <= 0) {
      // Invalid cookie segment; skip.
      continue
    }

    const name = part.slice(0, eqIndex).trim()
    const value = part.slice(eqIndex + 1)
    if (!name) continue

    map.set(name, value)
  }

  return map
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
