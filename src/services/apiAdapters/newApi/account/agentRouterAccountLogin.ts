import {
  ACCOUNT_LOGIN_METHODS,
  ACCOUNT_LOGIN_PROVIDERS,
} from "~/constants/accountLogin"
import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  isAgentRouterLoginUrl,
  isAgentRouterSystemName,
} from "~/services/accountLogin/providers/agentrouter/config"
import { AGENT_ROUTER_ACCOUNT_LOGIN } from "~/services/accountSiteDefinitions/deployments"
import type {
  AccountLoginCapability,
  AccountLoginEvidence,
} from "~/services/apiAdapters/contracts/accountLogin"
import { createNewApiOAuthFlow } from "~/services/apiAdapters/newApi/account/browserOAuth"
import {
  buildGithubAuthorizeUrl,
  buildLinuxDoAuthorizeUrl,
} from "~/services/apiService/newApiFamily/oauth/discovery"
import { fetchNewApiLoginMethods } from "~/services/apiService/newApiFamily/oauth/publicStatus"
import {
  createBrowserOAuthContext,
  type BrowserOAuthFlow,
} from "~/services/browserOAuth/browserOAuth"
import { isRecord } from "~/utils/core/object"

import { loginNewApiWithPassword } from "./passwordLogin"

/** Adapts the canonical deployment's actions and responses to the shared browser flow. */
export function createAgentRouterOAuthFlow(
  provider: (typeof AGENT_ROUTER_ACCOUNT_LOGIN.methods)[number],
): BrowserOAuthFlow<AccountLoginEvidence> {
  return {
    ...createNewApiOAuthFlow({ ...AGENT_ROUTER_ACCOUNT_LOGIN, provider }),
    id: `agentrouter-${provider}`,
    displayName: AGENT_ROUTER_ACCOUNT_LOGIN.displayName,
    prepareAction: RuntimeActionIds.ContentPrepareAgentRouterOAuth,
    prepareDetails: { loginProvider: provider },
    completeAction: RuntimeActionIds.ContentCompleteAgentRouterOAuth,
    clearEvidenceAction: RuntimeActionIds.ContentClearAgentRouterOAuthEvidence,
    parsePreparation(response) {
      if (!isRecord(response) || response.success !== true) return null
      const clientId =
        typeof response.clientId === "string" ? response.clientId : ""
      const state = typeof response.state === "string" ? response.state : ""
      try {
        return {
          authorizationUrl:
            provider === ACCOUNT_LOGIN_PROVIDERS.Github
              ? buildGithubAuthorizeUrl({ clientId, state })
              : buildLinuxDoAuthorizeUrl({ clientId, state }),
        }
      } catch {
        return null
      }
    },
  }
}

export const agentRouterAccountLogin: AccountLoginCapability = {
  supports: (account) => isAgentRouterLoginUrl(account.site_url),
  async discover(account) {
    if (!isAgentRouterLoginUrl(account.site_url)) return []
    const methods = await fetchNewApiLoginMethods(
      account.site_url,
      [...AGENT_ROUTER_ACCOUNT_LOGIN.methods, ACCOUNT_LOGIN_METHODS.Password],
      isAgentRouterSystemName,
    )
    return methods.map(({ provider, label }) => ({ id: provider, label }))
  },
  async login(request) {
    const { account, methodId, requestId, attended } = request
    if (!isAgentRouterLoginUrl(account.site_url)) {
      return { status: BROWSER_LOGIN_STATUS.Unsupported }
    }
    const expectedIdentity = String(account.account_info.id ?? "").trim()
    if (!expectedIdentity) return { status: BROWSER_LOGIN_STATUS.Failed }
    if (methodId === ACCOUNT_LOGIN_METHODS.Password)
      return loginNewApiWithPassword(
        request,
        AGENT_ROUTER_ACCOUNT_LOGIN.loginPath,
      )
    const provider = AGENT_ROUTER_ACCOUNT_LOGIN.methods.find(
      (implemented) => implemented === methodId,
    )
    if (!provider) return { status: BROWSER_LOGIN_STATUS.Unsupported }
    return createBrowserOAuthContext(
      createAgentRouterOAuthFlow(provider),
    ).authenticate({
      origin: new URL(account.site_url).origin,
      expectedIdentity,
      requestId,
      ...(attended === undefined ? {} : { attended }),
    })
  },
}
