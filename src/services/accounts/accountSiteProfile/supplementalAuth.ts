import type { AccountSiteType } from "~/constants/siteType"
import type { Sub2ApiAuthConfig } from "~/types"

import { ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS } from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

export type AccountSiteSupplementalAuthInput = {
  sub2apiAuth?: Sub2ApiAuthConfig
}

export type NormalizedAccountSiteSupplementalAuth = {
  sub2apiAuth?: Sub2ApiAuthConfig
}

/**
 * Normalizes account-site supplemental auth allowed by the product profile.
 */
export function normalizeAccountSiteSupplementalAuth({
  siteType,
  sub2apiAuth,
}: AccountSiteSupplementalAuthInput & {
  siteType: AccountSiteType
}): NormalizedAccountSiteSupplementalAuth {
  const profile = getAccountSiteProductProfile(siteType)
  if (
    profile.supplementalAuth.kind !==
    ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken
  ) {
    return {}
  }

  const refreshToken =
    typeof sub2apiAuth?.refreshToken === "string"
      ? sub2apiAuth.refreshToken.trim()
      : ""
  if (!refreshToken) return {}

  const tokenExpiresAt =
    typeof sub2apiAuth?.tokenExpiresAt === "number" &&
    Number.isFinite(sub2apiAuth.tokenExpiresAt) &&
    sub2apiAuth.tokenExpiresAt > 0
      ? sub2apiAuth.tokenExpiresAt
      : undefined

  return {
    sub2apiAuth: {
      refreshToken,
      ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
    },
  }
}
