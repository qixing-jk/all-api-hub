import type { AccountSiteType } from "~/constants/siteType"
import { normalizeSub2ApiAuth } from "~/services/apiAdapters/sub2api/authSession"
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
    profile.authSession.kind !==
    ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken
  ) {
    return {}
  }

  const normalized = normalizeSub2ApiAuth(sub2apiAuth)
  if (!normalized) return {}
  const tokenExpiresAt = normalized.tokenExpiresAt
  return {
    sub2apiAuth: {
      refreshToken: normalized.refreshToken,
      ...(tokenExpiresAt !== undefined && tokenExpiresAt > 0
        ? { tokenExpiresAt }
        : {}),
    },
  }
}
