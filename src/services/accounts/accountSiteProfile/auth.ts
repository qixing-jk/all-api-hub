import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import { getAccountSiteDefinitions } from "~/services/accountSiteDefinitions"
import { AuthTypeEnum } from "~/types"

import { getAccountSiteProductProfile } from "./registry"

const getHostname = (value: string | null | undefined): string | null => {
  if (!value?.trim()) return null

  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

const resolveAccountSiteTypeForDefaultAuthUrl = (
  url: string | null | undefined,
): AccountSiteType | null => {
  const hostname = getHostname(url)
  if (!hostname) return null

  for (const definition of getAccountSiteDefinitions()) {
    if (!isAccountSiteType(definition.siteType)) continue

    const hostnames = [
      ...(definition.productProfile?.auth?.defaultAuthHostnames ?? []),
      ...(definition.productProfile?.urls?.recognizedHostnames ?? []),
    ]

    if (hostnames.includes(hostname)) {
      return definition.siteType
    }
  }

  return null
}

/**
 * Resolves the default account auth type from the site product profile.
 */
export function resolveAccountSiteDefaultAuthType({
  siteType,
  url,
}: {
  siteType?: AccountSiteType | string | null
  url?: string | null
} = {}): AuthTypeEnum {
  const resolvedSiteType = isAccountSiteType(siteType)
    ? siteType
    : resolveAccountSiteTypeForDefaultAuthUrl(url)
  const profile = resolvedSiteType
    ? getAccountSiteProductProfile(resolvedSiteType)
    : null
  const hostname = getHostname(url)

  if (hostname && profile?.auth.defaultAuthHostnames.includes(hostname)) {
    return profile.auth.defaultAuthType
  }

  if (profile?.auth.defaultAuthHostnames.length) {
    return AuthTypeEnum.AccessToken
  }

  return profile?.auth.defaultAuthType ?? AuthTypeEnum.AccessToken
}
