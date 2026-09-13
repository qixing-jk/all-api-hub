import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountLoginEvidence } from "~/services/accountLogin/contracts"
import {
  createBrowserOAuthContext,
  type BrowserOAuthCompletion,
  type BrowserOAuthFlow,
} from "~/services/browserOAuth/browserOAuth"

/** Narrows an unknown content-script response to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Builds AgentRouter's fixed GitHub OAuth authorize URL. */
export function buildAgentRouterGithubAuthorizeUrl(input: {
  clientId: string
  state: string
}): string {
  const clientId = input.clientId.trim()
  const state = input.state.trim()
  if (!clientId || !/^[A-Za-z0-9_-]+$/.test(clientId) || !state) {
    throw new Error("Invalid AgentRouter GitHub OAuth parameters.")
  }

  const url = new URL("https://github.com/login/oauth/authorize")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("state", state)
  url.searchParams.set("scope", "user:email")
  return url.href
}

/**
 * Builds Linux DO's fixed OAuth2 URL. The endpoint and standard parameters are
 * documented at https://linux.do/t/topic/32752.
 */
export function buildAgentRouterLinuxDoAuthorizeUrl(input: {
  clientId: string
  state: string
}): string {
  const clientId = input.clientId.trim()
  const state = input.state.trim()
  if (!clientId || !/^[A-Za-z0-9_-]+$/.test(clientId) || !state) {
    throw new Error("Invalid AgentRouter Linux DO OAuth parameters.")
  }

  const url = new URL("https://connect.linux.do/oauth2/authorize")
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("state", state)
  return url.href
}

/** Maps AgentRouter callback evidence into the generic OAuth contract. */
function parseCompletion(
  response: unknown,
): BrowserOAuthCompletion<AccountLoginEvidence> {
  const record = asRecord(response)
  if (record?.reason === "identity_mismatch") {
    return { status: "identity_mismatch" as const }
  }
  const identity =
    typeof record?.userId === "string" ? record.userId.trim() : ""
  if (record?.success !== true || !identity) {
    return {
      status: "invalid" as const,
      ...(typeof record?.message === "string"
        ? { message: record.message }
        : {}),
    }
  }
  return {
    status: "verified" as const,
    identity,
    evidence:
      typeof record.checkedIn === "boolean"
        ? { checkedIn: record.checkedIn }
        : {},
  }
}

export const agentRouterGithubOAuthFlow = {
  id: "agentrouter-github",
  concurrencyKey: "agentrouter-session",
  displayName: "AgentRouter",
  loginPath: "/login",
  prepareAction: RuntimeActionIds.ContentPrepareAgentRouterOAuth,
  prepareDetails: {
    loginProvider: ACCOUNT_LOGIN_PROVIDERS.Github,
  },
  completeAction: RuntimeActionIds.ContentCompleteAgentRouterOAuth,
  clearEvidenceAction: RuntimeActionIds.ContentClearAgentRouterOAuthEvidence,
  parsePreparation(response) {
    const record = asRecord(response)
    const clientId =
      typeof record?.clientId === "string" ? record.clientId.trim() : ""
    const state = typeof record?.state === "string" ? record.state.trim() : ""
    if (record?.success !== true || !clientId || !state) return null

    try {
      return {
        authorizationUrl: buildAgentRouterGithubAuthorizeUrl({
          clientId,
          state,
        }),
      }
    } catch {
      return null
    }
  },
  parseCompletion,
  isAuthorizationUrl(url) {
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname === "/login/oauth/authorize"
    )
  },
  isCompletionUrl(url, origin) {
    return url.origin === origin && url.pathname === "/console/token"
  },
} satisfies BrowserOAuthFlow<AccountLoginEvidence>

export const agentRouterGithubBrowserOAuthContext = createBrowserOAuthContext(
  agentRouterGithubOAuthFlow,
)

export const agentRouterLinuxDoOAuthFlow = {
  id: "agentrouter-linuxdo",
  concurrencyKey: "agentrouter-session",
  displayName: "AgentRouter",
  loginPath: "/login",
  prepareAction: RuntimeActionIds.ContentPrepareAgentRouterOAuth,
  prepareDetails: {
    loginProvider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
  },
  completeAction: RuntimeActionIds.ContentCompleteAgentRouterOAuth,
  clearEvidenceAction: RuntimeActionIds.ContentClearAgentRouterOAuthEvidence,
  authorizationInteraction: {
    action: RuntimeActionIds.ContentApproveLinuxDoOAuth,
    isInteractionUrl(currentUrl, requestedUrl) {
      return (
        currentUrl.protocol === "https:" &&
        currentUrl.hostname === "connect.linux.do" &&
        currentUrl.pathname === "/oauth2/authorize" &&
        currentUrl.origin === requestedUrl.origin &&
        currentUrl.pathname === requestedUrl.pathname &&
        currentUrl.searchParams.get("client_id") ===
          requestedUrl.searchParams.get("client_id") &&
        currentUrl.searchParams.get("state") ===
          requestedUrl.searchParams.get("state")
      )
    },
  },
  parsePreparation(response) {
    const record = asRecord(response)
    const clientId =
      typeof record?.clientId === "string" ? record.clientId.trim() : ""
    const state = typeof record?.state === "string" ? record.state.trim() : ""
    if (record?.success !== true || !clientId || !state) return null

    try {
      return {
        authorizationUrl: buildAgentRouterLinuxDoAuthorizeUrl({
          clientId,
          state,
        }),
      }
    } catch {
      return null
    }
  },
  parseCompletion,
  isAuthorizationUrl(url) {
    return (
      url.protocol === "https:" &&
      url.hostname === "connect.linux.do" &&
      url.pathname === "/oauth2/authorize"
    )
  },
  isCompletionUrl(url, origin) {
    return url.origin === origin && url.pathname === "/console/token"
  },
} satisfies BrowserOAuthFlow<AccountLoginEvidence>

export const agentRouterLinuxDoBrowserOAuthContext = createBrowserOAuthContext(
  agentRouterLinuxDoOAuthFlow,
)
