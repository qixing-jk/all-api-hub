import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import {
  BROWSER_LOGIN_SESSION_KEYS,
  BROWSER_LOGIN_STATUS,
} from "~/constants/browserLogin"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { createBrowserPasswordContext } from "~/services/accountLogin/browserPassword"
import { normalizePasswordCredentials } from "~/services/accountLogin/passwordCredentials"
import { isAgentRouterLoginUrl } from "~/services/accountLogin/providers/agentrouter/config"
import { observeAgentRouterNativeLogin } from "~/services/accountLogin/providers/agentrouter/nativeLogin"
import type {
  AccountLoginRequest,
  AccountLoginResult,
} from "~/services/apiAdapters/contracts/accountLogin"
import { captureNewApiLoginCookieCredential } from "~/services/apiAdapters/newApi/account/cookieCredential"

/** Reuses the exact session queue used by New API OAuth, including AgentRouter. */
export async function loginNewApiWithPassword(
  request: AccountLoginRequest,
  loginPath: string,
): Promise<AccountLoginResult> {
  const credentials = normalizePasswordCredentials(
    request.account.login?.methodId === ACCOUNT_LOGIN_METHODS.Password
      ? request.account.login.credentials
      : undefined,
  )
  const expectedIdentity = String(request.account.account_info.id ?? "").trim()
  if (!credentials || !expectedIdentity || !request.requestId.trim())
    return { status: BROWSER_LOGIN_STATUS.Failed }
  return createBrowserPasswordContext({
    id: "new-api-password",
    concurrencyKey: BROWSER_LOGIN_SESSION_KEYS.NewApi,
    displayName: "New API",
    loginPath,
    uiAction: RuntimeActionIds.ContentNewApiPasswordUi,
    loginAction: RuntimeActionIds.ContentNewApiPasswordLogin,
    clearEvidenceAction: RuntimeActionIds.ContentClearNewApiPasswordLogin,
    credentials,
    captureCredential: captureNewApiLoginCookieCredential,
    ...(isAgentRouterLoginUrl(request.account.site_url)
      ? { observeNativeLogin: observeAgentRouterNativeLogin }
      : {}),
  }).authenticate({
    origin: new URL(request.account.site_url).origin,
    expectedIdentity,
    requestId: request.requestId,
    sessionMode: request.sessionMode,
    captureCredential: request.captureCredential,
    abortSignal: request.abortSignal,
    ...(request.attended === undefined ? {} : { attended: request.attended }),
  })
}
