import {
  API_AUTH_MODES,
  createAuthModeMemory,
  createUnauthorizedFallbackFetch,
  hasHttpStatus,
  replaceRequestCredentialHeaders,
} from "~/services/aiApi/authFallback"

export const ANTHROPIC_AUTH_MODES = API_AUTH_MODES

export type AnthropicAuthMode =
  (typeof ANTHROPIC_AUTH_MODES)[keyof typeof ANTHROPIC_AUTH_MODES]

export const ANTHROPIC_VERSION = "2023-06-01"

type AnthropicSdkAuthConfig = {
  apiKey: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

/**
 * Authentication mode learned from an explicit 401 challenge during this
 * extension session. The key is provider-neutral and scoped to the configured
 * Anthropic-compatible base URL.
 */
const authModeMemory = createAuthModeMemory<AnthropicAuthMode>(
  ANTHROPIC_AUTH_MODES.ApiKey,
)

/** Return the auth mode learned for an Anthropic-compatible base URL. */
export function getAnthropicAuthMode(baseUrl: string): AnthropicAuthMode {
  return authModeMemory.get(baseUrl)
}

/** Remember that a base URL accepted Bearer after an explicit 401 challenge. */
export function rememberAnthropicBearerAuth(baseUrl: string): void {
  authModeMemory.remember(baseUrl, ANTHROPIC_AUTH_MODES.Bearer)
}

/**
 * AI SDK Anthropic authentication contract:
 * https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
 * `apiKey` sends `x-api-key`; `authToken` sends `Authorization: Bearer`.
 */
export function createAnthropicAuthHeaders(
  apiKey: string,
  mode: AnthropicAuthMode,
): Record<string, string> {
  return {
    ...(mode === ANTHROPIC_AUTH_MODES.Bearer
      ? { Authorization: `Bearer ${apiKey}` }
      : { "x-api-key": apiKey }),
    "anthropic-version": ANTHROPIC_VERSION,
  }
}

/** Create a copy of a request that sends exactly one Anthropic credential. */
function replaceAnthropicCredential(
  request: Request,
  apiKey: string,
  mode: AnthropicAuthMode,
): Request {
  return replaceRequestCredentialHeaders(
    request,
    ["Authorization", "x-api-key"],
    createAnthropicAuthHeaders(apiKey, mode),
  )
}

/**
 * Build the explicit SDK authentication settings for an Anthropic-compatible
 * endpoint, including the one-time 401 fallback to Bearer authentication.
 */
export function createAnthropicSdkAuth(
  baseUrl: string,
  apiKey: string,
): AnthropicSdkAuthConfig {
  const initialMode = getAnthropicAuthMode(baseUrl)

  return {
    // Keep this explicit even in Bearer mode so every supported 3.x SDK path
    // can initialize without reading unavailable environment variables.
    apiKey,
    fetch: createUnauthorizedFallbackFetch({
      initialMode,
      fallbackMode: ANTHROPIC_AUTH_MODES.Bearer,
      replaceCredential: (request, mode) =>
        replaceAnthropicCredential(request, apiKey, mode),
      rememberFallback: () => rememberAnthropicBearerAuth(baseUrl),
    }),
  }
}

/** Return whether a transport error is the exact 401 challenge we can retry. */
export function isAnthropicUnauthorized(error: unknown): boolean {
  return hasHttpStatus(error, 401)
}
