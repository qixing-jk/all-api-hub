export const ANTHROPIC_AUTH_MODES = {
  ApiKey: "api-key",
  Bearer: "bearer",
} as const

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
const bearerAuthBaseUrls = new Set<string>()

/** Normalize the configured URL into a stable session-level auth scope. */
function normalizeAuthScope(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

/** Return the auth mode learned for an Anthropic-compatible base URL. */
export function getAnthropicAuthMode(baseUrl: string): AnthropicAuthMode {
  return bearerAuthBaseUrls.has(normalizeAuthScope(baseUrl))
    ? ANTHROPIC_AUTH_MODES.Bearer
    : ANTHROPIC_AUTH_MODES.ApiKey
}

/** Remember that a base URL accepted Bearer after an explicit 401 challenge. */
export function rememberAnthropicBearerAuth(baseUrl: string): void {
  bearerAuthBaseUrls.add(normalizeAuthScope(baseUrl))
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
  const headers = new Headers(request.headers)
  headers.delete("Authorization")
  headers.delete("x-api-key")

  const authHeaders = createAnthropicAuthHeaders(apiKey, mode)
  for (const [name, value] of Object.entries(authHeaders)) {
    headers.set(name, value)
  }

  return new Request(request, { headers })
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
    fetch: async (input, init) => {
      const request = new Request(input, init)

      if (initialMode === ANTHROPIC_AUTH_MODES.Bearer) {
        return fetch(
          replaceAnthropicCredential(
            request,
            apiKey,
            ANTHROPIC_AUTH_MODES.Bearer,
          ),
        )
      }

      const response = await fetch(request.clone())
      if (response.status !== 401) return response

      const fallbackResponse = await fetch(
        replaceAnthropicCredential(
          request,
          apiKey,
          ANTHROPIC_AUTH_MODES.Bearer,
        ),
      )
      if (fallbackResponse.status !== 401 && fallbackResponse.status !== 403) {
        rememberAnthropicBearerAuth(baseUrl)
      }

      return fallbackResponse
    },
  }
}

/** Return whether a transport error is the exact 401 challenge we can retry. */
export function isAnthropicUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 401
  )
}
