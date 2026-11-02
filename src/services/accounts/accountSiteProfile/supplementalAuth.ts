import type { AccountSiteType } from "~/constants/siteType"
import { normalizeSub2ApiAuth } from "~/services/apiAdapters/sub2api/auth/authSession"
import type { AimlApiAuthConfig, Sub2ApiAuthConfig } from "~/types"

import { ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS } from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

export type AccountSiteSupplementalAuthInput = {
  sub2apiAuth?: Sub2ApiAuthConfig
  aimlApiAuth?: AimlApiAuthConfig
}

export type NormalizedAccountSiteSupplementalAuth = {
  sub2apiAuth?: Sub2ApiAuthConfig
  aimlApiAuth?: AimlApiAuthConfig
}

/** Trims a supplemental secret and treats a blank value as absent. */
function normalizeSecret(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Normalizes account-site supplemental auth allowed by the product profile.
 *
 * Each kind is gated by the site's declared supplemental auth so a credential
 * cannot be stored for a site that never reads it.
 */
export function normalizeAccountSiteSupplementalAuth({
  siteType,
  sub2apiAuth,
  aimlApiAuth,
}: AccountSiteSupplementalAuthInput & {
  siteType: AccountSiteType
}): NormalizedAccountSiteSupplementalAuth {
  const profile = getAccountSiteProductProfile(siteType)

  if (
    profile.authSession.kind ===
    ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken
  ) {
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

  if (
    profile.authSession.kind ===
    ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.SecondaryApiKey
  ) {
    const apiKey = normalizeSecret(aimlApiAuth?.apiKey)
    return apiKey ? { aimlApiAuth: { apiKey } } : {}
  }

  return {}
}
