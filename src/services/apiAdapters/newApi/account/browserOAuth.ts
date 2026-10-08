import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountLoginEvidence } from "~/services/apiAdapters/contracts/accountLogin"
import {
  NEW_API_OAUTH_PROVIDERS,
  type NewApiOAuthProvider,
} from "~/services/apiService/newApiFamily/oauth/contracts"
import {
  type BrowserOAuthCompletion,
  type BrowserOAuthFlow,
} from "~/services/browserOAuth/browserOAuth"

/** Narrows an unknown content-script response to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Maps account login identity and optional evidence into the browser contract. */
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

/** Adapts the New API protocol to the generic browser executor using site policy. */
export function createNewApiOAuthFlow(input: {
  provider: NewApiOAuthProvider
  loginPath: string
  userIdHeader: string
  completionPaths: readonly string[]
}): BrowserOAuthFlow<AccountLoginEvidence> {
  const { provider } = input
  return {
    id: `new-api-${provider}`,
    concurrencyKey: "new-api-session",
    displayName: "New API",
    loginPath: input.loginPath,
    prepareAction: RuntimeActionIds.ContentPrepareNewApiOAuth,
    prepareDetails: {
      loginProvider: provider,
      userIdHeader: input.userIdHeader,
      completionPaths: input.completionPaths,
    },
    completeAction: RuntimeActionIds.ContentCompleteNewApiOAuth,
    clearEvidenceAction: RuntimeActionIds.ContentClearNewApiOAuthEvidence,
    ...(provider === NEW_API_OAUTH_PROVIDERS.LinuxDo
      ? {
          authorizationInteraction: {
            action: RuntimeActionIds.ContentApproveLinuxDoOAuth,
            isInteractionUrl(current: URL, requested: URL) {
              return (
                current.origin === "https://connect.linux.do" &&
                current.origin === requested.origin &&
                current.pathname === "/oauth2/authorize" &&
                current.pathname === requested.pathname &&
                current.searchParams.get("client_id") ===
                  requested.searchParams.get("client_id") &&
                current.searchParams.get("state") ===
                  requested.searchParams.get("state")
              )
            },
          },
        }
      : {}),
    parsePreparation(response) {
      const record = asRecord(response)
      if (record?.reason === "unsupported" || record?.reason === "uncertain") {
        return { status: record.reason }
      }
      return record?.success === true &&
        typeof record.authorizationUrl === "string"
        ? { authorizationUrl: record.authorizationUrl }
        : null
    },
    parseCompletion,
    isAuthorizationUrl(url) {
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !url.searchParams.get("state") ||
        !url.searchParams.get("client_id")
      )
        return false
      if (provider === "github")
        return (
          url.origin === "https://github.com" &&
          url.pathname === "/login/oauth/authorize"
        )
      if (provider === "linuxdo")
        return (
          url.origin === "https://connect.linux.do" &&
          url.pathname === "/oauth2/authorize"
        )
      if (provider === "discord")
        return (
          url.origin === "https://discord.com" &&
          url.pathname === "/oauth2/authorize"
        )
      return provider === "oidc"
    },
    isCompletionUrl(url, origin) {
      return (
        url.origin === origin && input.completionPaths.includes(url.pathname)
      )
    },
  }
}
