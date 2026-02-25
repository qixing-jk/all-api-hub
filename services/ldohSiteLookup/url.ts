import {
  LDOH_ORIGIN,
  LDOH_SITE_SEARCH_QUERY_PARAM,
} from "~/services/ldohSiteLookup/constants"
import { normalizeHttpUrl } from "~/utils/url"

export type NormalizedUrlMatchParts = {
  origin: string | null
  hostname: string | null
}

/**
 * Normalizes an arbitrary URL-like string for LDOH matching.
 *
 * - Only accepts HTTP(S) URLs (adds an implicit `https://` when scheme is missing).
 * - Returns lowercase `origin` + `hostname` for stable comparisons.
 * - Never returns path/query/hash parts, so secrets in query strings won't leak into logs or deeplinks.
 */
export function normalizeUrlForLdohMatch(
  value: string | undefined | null,
): NormalizedUrlMatchParts {
  const normalized = normalizeHttpUrl(value)
  if (!normalized) {
    return { origin: null, hostname: null }
  }

  try {
    const url = new URL(normalized)
    return {
      origin: url.origin.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
    }
  } catch {
    return { origin: null, hostname: null }
  }
}

/**
 * Builds an LDOH search URL for a given hostname.
 */
export function buildLdohSiteSearchUrl(hostname: string): string {
  const query = String(hostname ?? "")
    .trim()
    .toLowerCase()
  const url = new URL(LDOH_ORIGIN)
  url.searchParams.set(LDOH_SITE_SEARCH_QUERY_PARAM, query)
  return url.toString()
}

/**
 * Convenience helper: extracts the hostname from a URL-like string and builds the LDOH search URL.
 * Returns `null` when the input cannot be normalized into a valid hostname.
 */
export function buildLdohSiteSearchUrlFromUrl(value: string): string | null {
  const { hostname } = normalizeUrlForLdohMatch(value)
  if (!hostname) return null
  return buildLdohSiteSearchUrl(hostname)
}
