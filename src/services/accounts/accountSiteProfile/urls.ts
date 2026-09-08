import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import { getAccountSiteDefinitions } from "~/services/accountSiteDefinitions/registry"
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

/** Resolves only profiles that explicitly allow hostname-only URL normalization. */
export function findAccountSiteProfileForHostname(
  hostname: string,
): AccountSiteProductProfile | null {
  const normalizedHostname = hostname.toLowerCase()
  const definition = getAccountSiteDefinitions().find(
    (definition) =>
      definition.productProfile?.urls?.inferFromHostname &&
      definition.productProfile.urls.recognizedHostnames?.includes(
        normalizedHostname,
      ),
  )
  return definition && isAccountSiteType(definition.siteType)
    ? getAccountSiteProductProfile(definition.siteType)
    : null
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

  const parsed = parseHttpUrl(url)
  return parsed ? findAccountSiteProfileForHostname(parsed.hostname) : null
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

/**
 * Compares account site URLs using the same canonical origin key used by
 * duplicate-account scans and add-flow warnings.
 */
export function isSameAccountSiteOrigin(
  left: {
    siteType?: AccountSiteType | string
    url: string
  },
  right: {
    siteType?: AccountSiteType | string
    url: string
  },
): boolean {
  const leftKey = normalizeAccountSiteProfileUrlForDuplicateCheck(left)
  const rightKey = normalizeAccountSiteProfileUrlForDuplicateCheck(right)

  return Boolean(leftKey && rightKey && leftKey === rightKey)
}
