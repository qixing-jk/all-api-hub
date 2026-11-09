import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
} from "~/services/accounts/editing/accountDefaults"
import type { AccountLoginCredential } from "~/services/apiAdapters/contracts/accountLogin"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum, type SiteAccount } from "~/types"

/** Replace the exported credential while retaining its required transport context. */
export function applyRecoveredCredentialToRequest(
  request: ApiServiceRequest,
  credential: AccountLoginCredential,
): ApiServiceRequest {
  const cookie = credential.cookie ?? ""
  if (credential.accessToken)
    return {
      ...request,
      forceTempWindow: true,
      fetchContext: undefined,
      currentTabFallback: undefined,
      auth: {
        ...request.auth,
        accessToken: credential.accessToken,
        refreshToken: credential.sub2apiAuth?.refreshToken,
        tokenExpiresAt: credential.sub2apiAuth?.tokenExpiresAt,
      },
    }
  return {
    ...request,
    auth: { ...request.auth, cookie },
    cookieAuthSessionCookie: cookie,
    ...(request.cookieSession
      ? { cookieSession: { ...request.cookieSession, cookieHeader: cookie } }
      : {}),
  }
}

/** Apply one verified snapshot, explicitly clearing absent renewal material. */
export function applyRecoveredCredentialToAccount(
  account: SiteAccount,
  credential: AccountLoginCredential,
  now: number,
): SiteAccount {
  const nextAccount = applySiteAccountUpdates({
    account,
    updates:
      credential.cookie !== undefined
        ? {
            cookieAuth: {
              sessionCookie: credential.cookie,
            },
          }
        : {
            account_info: {
              access_token: credential.accessToken,
            },
            sub2apiAuth: credential.sub2apiAuth,
          },
    now,
    userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
  })
  if (credential.accessToken !== undefined)
    nextAccount.sub2apiAuth = credential.sub2apiAuth
  return nextAccount
}

/** Compare the complete saved pair so a late login cannot overwrite token rotation. */
export function savedCredential(account: SiteAccount): AccountLoginCredential {
  return account.authType === AuthTypeEnum.Cookie
    ? { cookie: account.cookieAuth?.sessionCookie ?? "" }
    : {
        accessToken: account.account_info.access_token,
        sub2apiAuth: account.sub2apiAuth,
      }
}
