import {
  API_AUTH_MODES,
  createAuthModeMemory,
  createUnauthorizedFallbackFetch,
  hasHttpStatus,
  replaceRequestCredentialHeaders,
} from "~/services/aiApi/authFallback"

export const GOOGLE_AUTH_MODES = API_AUTH_MODES

export type GoogleAuthMode =
  (typeof GOOGLE_AUTH_MODES)[keyof typeof GOOGLE_AUTH_MODES]

type GoogleSdkAuthConfig = {
  apiKey: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

const authModeMemory = createAuthModeMemory<GoogleAuthMode>(
  GOOGLE_AUTH_MODES.ApiKey,
)

/** Return the auth mode learned for a Google-compatible base URL. */
export function getGoogleAuthMode(baseUrl: string): GoogleAuthMode {
  return authModeMemory.get(baseUrl)
}

/** Remember that a Google-compatible base URL accepted Bearer after a 401. */
export function rememberGoogleBearerAuth(baseUrl: string): void {
  authModeMemory.remember(baseUrl, GOOGLE_AUTH_MODES.Bearer)
}

/**
 * Google Gemini API authentication contract:
 * https://ai.google.dev/gemini-api/docs/api-key
 * Native requests send API keys with `x-goog-api-key`.
 */
export function createGoogleAuthHeaders(
  apiKey: string,
  mode: GoogleAuthMode,
): Record<string, string> {
  return mode === GOOGLE_AUTH_MODES.Bearer
    ? { Authorization: `Bearer ${apiKey}` }
    : { "x-goog-api-key": apiKey }
}

/** Create a copy of a request that sends exactly one Google credential. */
function replaceGoogleCredential(
  request: Request,
  apiKey: string,
  mode: GoogleAuthMode,
): Request {
  return replaceRequestCredentialHeaders(
    request,
    ["Authorization", "x-goog-api-key"],
    createGoogleAuthHeaders(apiKey, mode),
  )
}

/** Build SDK authentication with a one-time 401 fallback to Bearer. */
export function createGoogleSdkAuth(
  baseUrl: string,
  apiKey: string,
): GoogleSdkAuthConfig {
  const initialMode = getGoogleAuthMode(baseUrl)

  return {
    // Keep apiKey explicit so the Google provider emits its native header first.
    apiKey,
    fetch: createUnauthorizedFallbackFetch({
      initialMode,
      fallbackMode: GOOGLE_AUTH_MODES.Bearer,
      replaceCredential: (request, mode) =>
        replaceGoogleCredential(request, apiKey, mode),
      rememberFallback: () => rememberGoogleBearerAuth(baseUrl),
    }),
  }
}

/** Return whether a transport error is the exact 401 challenge we can retry. */
export function isGoogleUnauthorized(error: unknown): boolean {
  return hasHttpStatus(error, 401)
}
