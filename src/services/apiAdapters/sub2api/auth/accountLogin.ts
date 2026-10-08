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

/** Reads static method adoption and login navigation from the site definition. */
function loginPolicy() {
  const definition = getAccountSiteDefinition(SITE_TYPES.SUB2API)
  return {
    providers:
      definition?.accountLogin?.methods.filter(isSub2ApiOAuthProvider) ?? [],
    loginPath: definition?.onboarding?.routes.loginPath,
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
    return discoverSub2ApiOAuthMethods(settings, loginPolicy().providers)
  },
  async login({ account, methodId, requestId, attended }) {
    if (!supportsSub2ApiAccountLogin(account)) return { status: "unsupported" }
    const policy = loginPolicy()
    const provider = policy.providers.find((method) => method === methodId)
    if (!provider || !policy.loginPath) return { status: "unsupported" }
    const expectedIdentity = normalizeSub2ApiLoginIdentity(
      account.account_info.id,
    )
    if (!expectedIdentity || !requestId.trim()) return { status: "failed" }
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
    return result.status === "authenticated"
      ? { status: "authenticated", identity: result.identity }
      : result
  },
}
