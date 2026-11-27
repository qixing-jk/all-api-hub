import { NEW_API_OAUTH_PROVIDERS } from "~/services/apiService/newApiFamily/oauth/contracts"
import {
  buildNewApiAuthorizationUrl,
  discoverNewApiLoginMethods,
} from "~/services/apiService/newApiFamily/oauth/discovery"
import { isRecord } from "~/utils/core/object"

import { NEW_API_TOKEN_VERIFICATION_ERRORS as VERIFICATION_ERRORS } from "./protocol"

export type NewApiTokenOAuthCallback = {
  state: string
  code: string
}

/** OAuth provider slugs are also used as a single path segment. */
export function isNewApiTokenOAuthProvider(value: unknown): value is string {
  return typeof value === "string" && /^[-a-zA-Z0-9_]+$/.test(value)
}

/** The website callback is distinct from the extension's proof exchange endpoint. */
export function newApiTokenOAuthCallbackPath(provider: string) {
  return `/oauth/${provider}`
}

/** Resolve standard and deployment-defined providers using the server's public configuration. */
export function buildTokenVerificationAuthorizationUrl(
  provider: string,
  state: string,
  origin: string,
  status: Record<string, unknown>,
  serverUrl?: string,
): string {
  if (!state || !isNewApiTokenOAuthProvider(provider))
    throw new Error("OAUTH_PROVIDER_INVALID")
  if (serverUrl) {
    const url = new URL(serverUrl)
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.searchParams.get("state") !== state
    )
      throw new Error("OAUTH_URL_INVALID")
    return url.href
  }
  const standard = discoverNewApiLoginMethods(
    status,
    Object.values(NEW_API_OAUTH_PROVIDERS),
  ).find((candidate) => candidate.provider === provider)
  if (standard) return buildNewApiAuthorizationUrl(standard, state, origin)
  const custom = Array.isArray(status.custom_oauth_providers)
    ? status.custom_oauth_providers.find(
        (item) => isRecord(item) && item.slug === provider,
      )
    : undefined
  if (
    !isRecord(custom) ||
    typeof custom.authorization_endpoint !== "string" ||
    typeof custom.client_id !== "string"
  )
    throw new Error("OAUTH_PROVIDER_UNAVAILABLE")
  const url = new URL(custom.authorization_endpoint)
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("OAUTH_URL_INVALID")
  url.searchParams.set("client_id", custom.client_id)
  url.searchParams.set(
    "redirect_uri",
    `${origin}${newApiTokenOAuthCallbackPath(provider)}`,
  )
  url.searchParams.set("response_type", "code")
  url.searchParams.set("state", state)
  if (typeof custom.scopes === "string")
    url.searchParams.set("scope", custom.scopes)
  return url.href
}

/** Accept only the callback owned by this operation; never exchange unrelated authorization codes. */
export function readTokenOAuthCallback(
  rawUrl: string,
  origin: string,
  provider: string,
  state: string,
): NewApiTokenOAuthCallback | null {
  const url = new URL(rawUrl)
  if (
    url.origin !== origin ||
    url.pathname !== newApiTokenOAuthCallbackPath(provider)
  )
    return null
  if (url.searchParams.get("state") !== state)
    throw new Error(VERIFICATION_ERRORS.OAUTH_STATE_INVALID)
  if (url.searchParams.has("error"))
    throw new Error(VERIFICATION_ERRORS.OAUTH_CANCELLED)
  const code = url.searchParams.get("code")
  if (!code) throw new Error("OAUTH_CODE_MISSING")
  return { state, code }
}
