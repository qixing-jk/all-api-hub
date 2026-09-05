import type { AccountSiteType } from "~/constants/siteType"

import { ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS } from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

/**
 * Resolves whether account-scoped API requests should carry auth-session hooks.
 */
export function shouldDecorateAccountApiRequestWithAuthSession(
  siteType: AccountSiteType,
): boolean {
  return (
    getAccountSiteProductProfile(siteType).authSession.kind ===
    ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken
  )
}
