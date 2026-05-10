import {
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

const AIHUBMIX_HOSTNAME_SET: ReadonlySet<string> = new Set(AIHUBMIX_HOSTNAMES)

const parseHttpUrl = (value: string): URL | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null
  } catch {
    return null
  }
}

/**
 * Checks whether a user-supplied URL points at one of AIHubMix's supported hosts.
 */
export function isAIHubMixSiteUrl(value: string): boolean {
  const parsed = parseHttpUrl(value)
  return parsed
    ? AIHUBMIX_HOSTNAME_SET.has(parsed.hostname.toLowerCase())
    : false
}

/**
 * Canonicalizes the URL persisted for account UI navigation.
 *
 * AIHubMix API calls are pinned to `https://aihubmix.com`, while the user-facing
 * console pages live under `https://console.aihubmix.com`.
 */
export function normalizeAccountSiteUrlForStorage(params: {
  siteType: AccountSiteType | string
  url: string
}): string {
  if (params.siteType === SITE_TYPES.AIHUBMIX) {
    return AIHUBMIX_WEB_ORIGIN
  }

  return params.url.trim()
}

/**
 * Produces a stable origin key for duplicate-account scans and warnings.
 */
export function normalizeAccountSiteUrlForOriginKey(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  if (
    params.siteType === SITE_TYPES.AIHUBMIX ||
    isAIHubMixSiteUrl(params.url)
  ) {
    return AIHUBMIX_WEB_ORIGIN.toLowerCase()
  }

  return normalizeUrlForOriginKey(params.url, { lowerCase: true })
}
