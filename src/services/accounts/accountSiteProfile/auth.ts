import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
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
  const profile = isAccountSiteType(siteType)
    ? getAccountSiteProductProfile(siteType)
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
