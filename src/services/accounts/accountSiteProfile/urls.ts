import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { sanitizeOriginUrl } from "~/utils/core/url"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import type { AccountSiteProductProfile } from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

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
 * Checks whether a URL-like value belongs to the profile's recognized hosts.
 */
export function isAccountSiteProfileUrl(
  siteType: AccountSiteType,
  value: string,
): boolean {
  const parsed = parseHttpUrl(value)
  if (!parsed) return false

  const profile = getAccountSiteProductProfile(siteType)
  return profile.urls.recognizedHostnames.includes(
    parsed.hostname.toLowerCase(),
  )
}

const resolveProfileForUrl = ({
  siteType,
  url,
}: {
  siteType?: AccountSiteType | string
  url: string
}): AccountSiteProductProfile | null => {
  if (isAccountSiteType(siteType)) {
    return getAccountSiteProductProfile(siteType)
  }

  if (isAccountSiteProfileUrl(SITE_TYPES.AIHUBMIX, url)) {
    return getAccountSiteProductProfile(SITE_TYPES.AIHUBMIX)
  }

  return null
}

/**
 * Canonicalizes the URL persisted for account UI navigation.
 */
export function normalizeAccountSiteProfileUrlForStorage(params: {
  siteType: AccountSiteType | string
  url: string
}): string {
  const profile = isAccountSiteType(params.siteType)
    ? getAccountSiteProductProfile(params.siteType)
    : null

  return profile?.urls.storageOrigin ?? params.url.trim()
}

/**
 * Resolves the API origin to use when an account is exported into a managed site.
 */
export function normalizeAccountSiteProfileUrlForManagedChannel(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  const profile = resolveProfileForUrl(params)

  return profile?.urls.managedChannelOrigin ?? params.url.trim()
}

/**
 * Produces a stable origin key for profile-aware account comparisons.
 */
export function normalizeAccountSiteProfileUrlForOriginKey(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  const profile = resolveProfileForUrl(params)

  return (
    profile?.urls.duplicateOrigin?.toLowerCase() ??
    normalizeUrlForOriginKey(params.url, { lowerCase: true })
  )
}

/**
 * Produces the scannable origin key used by duplicate-site detection.
 */
export function normalizeAccountSiteProfileUrlForDuplicateCheck(params: {
  siteType?: AccountSiteType | string
  url: string
}): string | undefined {
  const profile = resolveProfileForUrl(params)
  const duplicateOrigin = profile?.urls.duplicateOrigin?.toLowerCase()

  if (duplicateOrigin) {
    return duplicateOrigin
  }

  return sanitizeOriginUrl(params.url)?.toLowerCase()
}
