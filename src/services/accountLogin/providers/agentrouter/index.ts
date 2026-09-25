import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import type { AccountLoginCapability } from "~/services/accountLogin/contracts"

import {
  agentRouterGithubBrowserOAuthContext,
  agentRouterLinuxDoBrowserOAuthContext,
} from "./browserOAuth"
import { isAgentRouterLoginUrl } from "./config"

const browserContexts = {
  [ACCOUNT_LOGIN_PROVIDERS.Github]: agentRouterGithubBrowserOAuthContext,
  [ACCOUNT_LOGIN_PROVIDERS.LinuxDo]: agentRouterLinuxDoBrowserOAuthContext,
}

export const agentRouterAccountLogin: AccountLoginCapability = {
  supports: (account) => isAgentRouterLoginUrl(account.site_url),
  async login({ account, provider, requestId, attended }) {
    if (!isAgentRouterLoginUrl(account.site_url))
      return { status: "unsupported" }
    const expectedIdentity = String(account.account_info.id ?? "").trim()
    if (!expectedIdentity) return { status: "failed" }
    if (
      provider !== ACCOUNT_LOGIN_PROVIDERS.Github &&
      provider !== ACCOUNT_LOGIN_PROVIDERS.LinuxDo
    ) {
      return { status: "unsupported" }
    }
    return browserContexts[provider].authenticate({
      origin: new URL(account.site_url).origin,
      expectedIdentity,
      requestId,
      ...(attended === undefined ? {} : { attended }),
    })
  },
}
