import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { resolveDeploymentApiOrigin } from "~/constants/deploymentApiOrigins"
import { SITE_TYPES } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import type {
  AccountLoginCapability,
  AccountLoginTarget,
} from "~/services/apiAdapters/contracts/accountLogin"
import { createSub2ApiOAuthFlow } from "~/services/apiAdapters/sub2api/auth/browserOAuth"
import { fetchSub2ApiPublicSettings } from "~/services/apiService/sub2api/account/publicSettings"
import {
  discoverSub2ApiOAuthMethods,
  isSub2ApiOAuthProvider,
  normalizeSub2ApiLoginIdentity,
} from "~/services/apiService/sub2api/oauth/protocol"
import { createBrowserOAuthContext } from "~/services/browserOAuth/browserOAuth"
import { AuthTypeEnum } from "~/types/auth"

import { loginSub2ApiWithPassword } from "./passwordLogin"

/** Reads static method adoption and login navigation from the site definition. */
function loginPolicy() {
  const definition = getAccountSiteDefinition(SITE_TYPES.SUB2API)
  return {
    providers:
      definition?.accountLogin?.methods.filter(isSub2ApiOAuthProvider) ?? [],
    loginPath: definition?.onboarding?.routes.loginPath,
    password:
      definition?.accountLogin?.methods.includes(
        ACCOUNT_LOGIN_METHODS.Password,
      ) === true,
  }
}

/** Checks whether the account and registered policy can use Sub2API login. */
function supportsSub2ApiAccountLogin(account: AccountLoginTarget): boolean {
  if (account.site_type !== SITE_TYPES.SUB2API) return false
  const policy = loginPolicy()
  if (!policy.loginPath || policy.providers.length === 0) return false
  try {
    const url = new URL(account.site_url)
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      resolveDeploymentApiOrigin(url.origin) === url.origin
    )
  } catch {
    return false
  }
}

export const sub2ApiAccountLogin: AccountLoginCapability = {
  supports: supportsSub2ApiAccountLogin,
  async discover(account) {
    if (!supportsSub2ApiAccountLogin(account)) return []
    const settings = await fetchSub2ApiPublicSettings({
      baseUrl: new URL(account.site_url).origin,
      auth: { authType: AuthTypeEnum.None },
    })
    if (!settings)
      throw new Error("Sub2API login methods could not be discovered")
    const policy = loginPolicy()
    return [
      ...discoverSub2ApiOAuthMethods(settings, policy.providers),
      ...(policy.password
        ? [{ id: ACCOUNT_LOGIN_METHODS.Password, label: "Password" }]
        : []),
    ]
  },
  async login(request) {
    const { account, methodId, requestId, attended } = request
    if (!supportsSub2ApiAccountLogin(account))
      return { status: BROWSER_LOGIN_STATUS.Unsupported }
    const policy = loginPolicy()
    if (
      methodId === ACCOUNT_LOGIN_METHODS.Password &&
      policy.password &&
      policy.loginPath
    )
      return loginSub2ApiWithPassword(request, policy.loginPath)
    const provider = policy.providers.find((method) => method === methodId)
    if (!provider || !policy.loginPath)
      return { status: BROWSER_LOGIN_STATUS.Unsupported }
    const expectedIdentity = normalizeSub2ApiLoginIdentity(
      account.account_info.id,
    )
    if (!expectedIdentity || !requestId.trim())
      return { status: BROWSER_LOGIN_STATUS.Failed }
    const origin = new URL(account.site_url).origin
    const result = await createBrowserOAuthContext(
      createSub2ApiOAuthFlow({
        provider,
        origin,
        requestId,
        loginPath: policy.loginPath,
      }),
    ).authenticate({
      origin,
      expectedIdentity,
      requestId,
      ...(attended === undefined ? {} : { attended }),
    })
    return result.status === BROWSER_LOGIN_STATUS.Authenticated
      ? {
          status: BROWSER_LOGIN_STATUS.Authenticated,
          identity: result.identity,
        }
      : result
  },
}
