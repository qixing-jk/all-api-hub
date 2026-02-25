import type { LdohSiteSummary } from "./types"
import { normalizeUrlForLdohMatch } from "./url"

export type LdohSiteLookupIndex = {
  byOrigin: Map<string, LdohSiteSummary[]>
  byHostname: Map<string, LdohSiteSummary[]>
}

/**
 * Builds an in-memory lookup index for LDOH site directory items.
 *
 * Matching rules are intentionally strict: callers typically want to show UI
 * actions only when the directory match is unambiguous.
 */
export function buildLdohSiteLookupIndex(
  items: LdohSiteSummary[],
): LdohSiteLookupIndex {
  const byOrigin = new Map<string, LdohSiteSummary[]>()
  const byHostname = new Map<string, LdohSiteSummary[]>()

  for (const item of items) {
    const { origin, hostname } = normalizeUrlForLdohMatch(item.apiBaseUrl)
    if (origin) {
      const bucket = byOrigin.get(origin) ?? []
      bucket.push(item)
      byOrigin.set(origin, bucket)
    }
    if (hostname) {
      const bucket = byHostname.get(hostname) ?? []
      bucket.push(item)
      byHostname.set(hostname, bucket)
    }
  }

  return { byOrigin, byHostname }
}

/**
 * Attempts to find an unambiguous LDOH directory match for an account base URL.
 *
 * - Prefers exact `origin` matches (scheme + host + port).
 * - Falls back to hostname-only matches when unique.
 * - Returns `null` when there are zero matches or multiple candidates.
 */
export function matchLdohSiteForAccount(
  index: LdohSiteLookupIndex,
  accountBaseUrl: string,
): LdohSiteSummary | null {
  const { origin, hostname } = normalizeUrlForLdohMatch(accountBaseUrl)

  if (origin) {
    const matches = index.byOrigin.get(origin) ?? []
    if (matches.length === 1) {
      return matches[0]
    }
    if (matches.length > 1) {
      return null
    }
  }

  if (hostname) {
    const matches = index.byHostname.get(hostname) ?? []
    if (matches.length === 1) {
      return matches[0]
    }
  }

  return null
}
