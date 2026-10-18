import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import {
  BROWSER_LOGIN_SESSION_KEYS,
  BROWSER_LOGIN_STATUS,
} from "~/constants/browserLogin"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { createBrowserPasswordContext } from "~/services/accountLogin/browserPassword"
import { normalizePasswordCredentials } from "~/services/accountLogin/passwordCredentials"
import type {
  AccountLoginRequest,
  AccountLoginResult,
} from "~/services/apiAdapters/contracts/accountLogin"
import { normalizeSub2ApiLoginIdentity } from "~/services/apiService/sub2api/oauth/protocol"

/** Keeps native password and OAuth logins on the same Sub2API session queue. */
export async function loginSub2ApiWithPassword(
  request: AccountLoginRequest,
  loginPath: string,
): Promise<AccountLoginResult> {
  const credentials = normalizePasswordCredentials(
    request.account.login?.methodId === ACCOUNT_LOGIN_METHODS.Password
      ? request.account.login.credentials
      : undefined,
  )
  const expectedIdentity = normalizeSub2ApiLoginIdentity(
    request.account.account_info.id,
  )
  if (!credentials || !expectedIdentity || !request.requestId.trim())
    return { status: BROWSER_LOGIN_STATUS.Failed }
  return createBrowserPasswordContext({
    id: "sub2api-password",
    concurrencyKey: BROWSER_LOGIN_SESSION_KEYS.Sub2Api,
    displayName: "Sub2API",
    loginPath,
    uiAction: RuntimeActionIds.ContentSub2ApiPasswordUi,
    loginAction: RuntimeActionIds.ContentSub2ApiPasswordLogin,
    clearEvidenceAction: RuntimeActionIds.ContentClearSub2ApiPasswordLogin,
    credentials,
  }).authenticate({
    origin: new URL(request.account.site_url).origin,
    expectedIdentity,
    requestId: request.requestId,
    sessionMode: request.sessionMode,
    ...(request.attended === undefined ? {} : { attended: request.attended }),
  })
}
