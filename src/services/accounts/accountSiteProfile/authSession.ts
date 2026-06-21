import type { AccountSiteType } from "~/constants/siteType"

import { getAccountSiteProductProfile } from "./registry"

/**
 * Resolves whether account-scoped API requests should carry auth-session hooks.
 */
export function shouldDecorateAccountApiRequestWithAuthSession(
  siteType: AccountSiteType,
): boolean {
  return getAccountSiteProductProfile(siteType).authSession
    .decoratesAccountApiRequests
}
