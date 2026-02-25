import type { LdohSiteListCache, LdohSiteSummary } from "./types"

/**
 * Coerces an unknown value into a safe {@link LdohSiteSummary} shape.
 *
 * This is used for both:
 * - LDOH API responses (untrusted input)
 * - extension storage reads (may contain stale/invalid data)
 */
export function coerceLdohSiteSummary(raw: unknown): LdohSiteSummary | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as any
  const id = typeof obj.id === "string" ? obj.id.trim() : ""
  const apiBaseUrl =
    typeof obj.apiBaseUrl === "string" ? obj.apiBaseUrl.trim() : ""
  if (!id || !apiBaseUrl) return null

  const name = typeof obj.name === "string" ? obj.name.trim() : undefined

  return {
    id,
    apiBaseUrl,
    ...(name ? { name } : {}),
  }
}

/**
 * Coerces an unknown list into a validated, de-duplicated list of {@link LdohSiteSummary}.
 *
 * - Non-array inputs return an empty array (resilient to malformed API/storage payloads).
 * - De-dupes by `id` to keep results stable across refreshes.
 */
export function coerceLdohSiteSummaryList(raw: unknown): LdohSiteSummary[] {
  const rawItems = Array.isArray(raw) ? raw : []
  const items: LdohSiteSummary[] = []
  const seen = new Set<string>()

  for (const item of rawItems) {
    const coerced = coerceLdohSiteSummary(item)
    if (!coerced) continue
    if (seen.has(coerced.id)) continue
    seen.add(coerced.id)
    items.push(coerced)
  }

  return items
}

/**
 * Coerces an unknown value into a validated {@link LdohSiteListCache}.
 * Returns `null` when missing, invalid, or on unsupported cache versions.
 */
export function coerceLdohSiteListCache(
  raw: unknown,
): LdohSiteListCache | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as any

  const version = obj.version
  if (version !== 1) return null

  const fetchedAt = typeof obj.fetchedAt === "number" ? obj.fetchedAt : NaN
  const expiresAt = typeof obj.expiresAt === "number" ? obj.expiresAt : NaN
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null
  if (expiresAt < fetchedAt) return null

  const items = coerceLdohSiteSummaryList(obj.items)

  return {
    version: 1,
    fetchedAt,
    expiresAt,
    items,
  }
}
