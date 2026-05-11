import {
  AIHUBMIX_API_ORIGIN,
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
 * Resolves the API origin to use when an account is exported into a managed-site
 * upstream channel. AIHubMix adapters pin token-authenticated API traffic to
 * `https://aihubmix.com`; the console origin is only the account UI entrypoint.
 *
 * Source: https://docs.aihubmix.com/en/api/Aihubmix-Integration documents
 * OpenAI-compatible calls with `base_url="https://aihubmix.com/v1"`.
 */
export function normalizeAccountSiteUrlForManagedChannel(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  if (
    params.siteType === SITE_TYPES.AIHUBMIX ||
    isAIHubMixSiteUrl(params.url)
  ) {
    return AIHUBMIX_API_ORIGIN
  }

  return params.url.trim()
}

/**
 * Returns an account copy with the upstream URL normalized for managed-channel
 * import flows.
 */
export function normalizeAccountForManagedChannel<
  TAccount extends { siteType?: AccountSiteType | string; baseUrl: string },
>(account: TAccount): TAccount {
  return {
    ...account,
    baseUrl: normalizeAccountSiteUrlForManagedChannel({
      siteType: account.siteType,
      url: account.baseUrl,
    }),
  }
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
