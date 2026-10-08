import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
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
      AGENT_ROUTER_ACCOUNT_LOGIN.methods,
      isAgentRouterSystemName,
    )
    return methods.map(({ provider, label }) => ({ id: provider, label }))
  },
  async login({ account, methodId, requestId, attended }) {
    if (!isAgentRouterLoginUrl(account.site_url)) {
      return { status: "unsupported" }
    }
    const expectedIdentity = String(account.account_info.id ?? "").trim()
    if (!expectedIdentity) return { status: "failed" }
    const provider = AGENT_ROUTER_ACCOUNT_LOGIN.methods.find(
      (implemented) => implemented === methodId,
    )
    if (!provider) return { status: "unsupported" }
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
