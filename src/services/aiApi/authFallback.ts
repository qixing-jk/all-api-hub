export const API_AUTH_MODES = {
  ApiKey: "api-key",
  Bearer: "bearer",
} as const

type AuthModeMemory<TMode extends string> = {
  get: (baseUrl: string) => TMode
  remember: (baseUrl: string, mode: TMode) => void
}

type UnauthorizedFallbackParams<TMode extends string, TResult> = {
  initialMode: TMode
  fallbackMode: TMode
  run: (mode: TMode) => Promise<TResult>
  isUnauthorized: (error: unknown) => boolean
  rememberFallback: () => void
}

type UnauthorizedFallbackFetchParams<TMode extends string> = {
  initialMode: TMode
  fallbackMode: TMode
  replaceCredential: (request: Request, mode: TMode) => Request
  rememberFallback: () => void
}

/** Normalize a compatible API URL into a stable session-level auth scope. */
function normalizeAuthScope(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

/** Store an auth mode learned for a compatible base URL during this session. */
export function createAuthModeMemory<TMode extends string>(
  defaultMode: TMode,
): AuthModeMemory<TMode> {
  const modesByBaseUrl = new Map<string, TMode>()

  return {
    get: (baseUrl) =>
      modesByBaseUrl.get(normalizeAuthScope(baseUrl)) ?? defaultMode,
    remember: (baseUrl, mode) => {
      modesByBaseUrl.set(normalizeAuthScope(baseUrl), mode)
    },
  }
}

/** Copy a request while replacing only the provider-owned credential headers. */
export function replaceRequestCredentialHeaders(
  request: Request,
  credentialHeaderNames: readonly string[],
  replacementHeaders: Record<string, string>,
): Request {
  const headers = new Headers(request.headers)
  for (const name of credentialHeaderNames) headers.delete(name)
  for (const [name, value] of Object.entries(replacementHeaders)) {
    headers.set(name, value)
  }

  return new Request(request, { headers })
}

/** Run once with a fallback auth mode after an explicit unauthorized error. */
export async function executeWithUnauthorizedFallback<
  TMode extends string,
  TResult,
>(
  params: UnauthorizedFallbackParams<TMode, TResult>,
): Promise<{
  result: TResult
  mode: TMode
}> {
  try {
    return {
      result: await params.run(params.initialMode),
      mode: params.initialMode,
    }
  } catch (error) {
    if (
      params.initialMode === params.fallbackMode ||
      !params.isUnauthorized(error)
    ) {
      throw error
    }

    const result = await params.run(params.fallbackMode)
    params.rememberFallback()
    return { result, mode: params.fallbackMode }
  }
}

/** Create an SDK fetch that retries one 401 with a provider-defined credential. */
export function createUnauthorizedFallbackFetch<TMode extends string>(
  params: UnauthorizedFallbackFetchParams<TMode>,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const request = new Request(input, init)

    if (params.initialMode === params.fallbackMode) {
      return fetch(params.replaceCredential(request, params.fallbackMode))
    }

    const response = await fetch(request.clone())
    if (response.status !== 401) return response

    const fallbackResponse = await fetch(
      params.replaceCredential(request, params.fallbackMode),
    )
    if (fallbackResponse.status !== 401 && fallbackResponse.status !== 403) {
      params.rememberFallback()
    }

    return fallbackResponse
  }
}

/** Return whether a transport error exposes the exact retryable status code. */
export function hasHttpStatus(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === statusCode
  )
}
