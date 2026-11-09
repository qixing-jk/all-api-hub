import type { AccountSiteType } from "~/constants/siteType"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/auth/authSession"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS } from "./contracts"
import { getAccountSiteProductProfile } from "./registry"
import { accountSub2ApiAuthSession } from "./sub2apiAuthSession"

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

/** Attach the saved account's credential lifecycle to each account request. */
export function withAccountAuthSession<TRequest extends ApiServiceRequest>(
  siteType: AccountSiteType,
  request: TRequest,
): Sub2ApiAuthSessionRequest<TRequest> {
  return shouldDecorateAccountApiRequestWithAuthSession(siteType)
    ? { ...request, sub2apiAuthSession: accountSub2ApiAuthSession }
    : request
}
