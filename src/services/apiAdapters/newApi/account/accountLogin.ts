import type { AccountSiteType } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import type {
  AccountLoginCapability,
  AccountLoginTarget,
} from "~/services/apiAdapters/contracts/accountLogin"
import { createNewApiOAuthFlow } from "~/services/apiAdapters/newApi/account/browserOAuth"
import { isNewApiLoginProvider } from "~/services/apiService/newApiFamily/oauth/discovery"
import { fetchNewApiLoginMethods } from "~/services/apiService/newApiFamily/oauth/publicStatus"
import { createBrowserOAuthContext } from "~/services/browserOAuth/browserOAuth"

/** Explicit protocol adoption, independent of the wider API compatibility bucket. */
export function createNewApiAccountLogin(
  siteType: AccountSiteType,
): AccountLoginCapability | undefined {
  const definition = getAccountSiteDefinition(siteType)
  const config = definition?.accountLogin
  const protocol = config?.protocols?.newApi
  const loginPath = definition?.onboarding?.routes.loginPath
  if (!config || !protocol || !loginPath) return undefined
  const providers = config.methods.filter(isNewApiLoginProvider)
  if (providers.length === 0) return undefined
  const supports = (account: AccountLoginTarget) => {
    try {
      const url = new URL(account.site_url)
      return (
        account.site_type === siteType &&
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
    } catch {
      return false
    }
  }
  return {
    async discover(account) {
      if (!supports(account)) return []
      const methods = await fetchNewApiLoginMethods(account.site_url, providers)
      return methods.map(({ provider, label }) => ({ id: provider, label }))
    },
    supports,
    async login(request) {
      const provider = providers.find(
        (candidate) => candidate === request.methodId,
      )
      if (!supports(request.account) || !provider)
        return { status: "unsupported" }
      const expectedIdentity = String(
        request.account.account_info.id ?? "",
      ).trim()
      if (!expectedIdentity) return { status: "failed" }
      return createBrowserOAuthContext(
        createNewApiOAuthFlow({
          ...protocol,
          provider,
          loginPath,
        }),
      ).authenticate({
        origin: new URL(request.account.site_url).origin,
        expectedIdentity,
        requestId: request.requestId,
        ...(request.attended === undefined
          ? {}
          : { attended: request.attended }),
      })
    },
  }
}
