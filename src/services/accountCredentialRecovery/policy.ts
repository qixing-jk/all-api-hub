import { ACCOUNT_LOGIN_CREDENTIAL_KINDS } from "~/constants/accountLogin"
import { isAccountSiteType } from "~/constants/siteType"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import { supportsAccountCookieValidation } from "~/services/accounts/cookieValidation"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import type { AccountLoginTarget } from "~/services/apiAdapters/contracts/accountLogin"
import { getAccountLoginCapability } from "~/services/apiAdapters/registry"
import { AuthTypeEnum, type SiteAccount } from "~/types"

/** Adoption and implemented method support must agree on the exported credential. */
function supportsRecoveryMethod(
  account: AccountLoginTarget,
  kind: (typeof ACCOUNT_LOGIN_CREDENTIAL_KINDS)[keyof typeof ACCOUNT_LOGIN_CREDENTIAL_KINDS],
  methodId?: string,
): boolean {
  return (
    isAccountSiteType(account.site_type) &&
    getAccountSiteDefinition(account.site_type)?.accountLogin
      ?.supportsCredentialRecovery === true &&
    getAccountLoginMethods(account).some(
      (method) =>
        method.credentialRecovery === kind &&
        (methodId === undefined || method.id === methodId),
    )
  )
}

/** Cookie capture is opt-in per site; a login capability alone is insufficient. */
export function supportsAccountCookieRecovery(
  account: AccountLoginTarget & Partial<Pick<SiteAccount, "authType">>,
  methodId?: string,
): boolean {
  return (
    (account.authType === undefined ||
      account.authType === AuthTypeEnum.Cookie) &&
    isAccountSiteType(account.site_type) &&
    supportsAccountCookieValidation(account.site_type) &&
    supportsRecoveryMethod(
      account,
      ACCOUNT_LOGIN_CREDENTIAL_KINDS.Cookie,
      methodId,
    )
  )
}

/** Admission shared by the editor, guidance and credential recovery runner. */
export function supportsAccountCredentialRecovery(
  account: AccountLoginTarget & Partial<Pick<SiteAccount, "authType">>,
  methodId?: string,
): boolean {
  return (
    supportsAccountCookieRecovery(account, methodId) ||
    (isAccountSiteType(account.site_type) &&
      account.authType === AuthTypeEnum.AccessToken &&
      getAccountLoginCapability(account)?.credentialRecovery !== undefined &&
      supportsRecoveryMethod(
        account,
        ACCOUNT_LOGIN_CREDENTIAL_KINDS.Sub2ApiToken,
        methodId,
      ))
  )
}
