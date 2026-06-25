import { RuntimeActionIds } from "~/constants/runtimeActions"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import { createMinIntervalLimiter } from "~/services/apiTransport/minIntervalLimiter"
import { extractDataFromApiResponseBody } from "~/services/apiTransport/response"
import { withSiteApiRequestLimit } from "~/services/apiTransport/siteRequestLimiter"
import type {
  ApiResponse,
  ApiTransportFetchContext,
  ApiTransportRequest,
  AuthConfig,
  FetchApiOptions,
} from "~/services/apiTransport/type"
import {
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  summarizeApiTransportFetchContext,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import type { TempWindowResponseType } from "~/types/tempWindowFetch"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"
import {
  addAuthMethodHeader,
  addExtensionHeader,
  AUTH_MODE,
  COOKIE_AUTH_HEADER_NAME,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
} from "~/utils/browser/cookieHelper"
import {
  normalizeHeaderInit,
  normalizeRequestInitForMessage,
} from "~/utils/browser/requestInitMessage"
import { executeWithTempWindowFallback } from "~/utils/browser/tempWindowFetch"
import { isTestMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { joinUrl } from "~/utils/core/url"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"

export {
  extractDataFromApiResponseBody,
  isHttpUrl,
} from "~/services/apiTransport/response"

type NormalizedAuthContext = AuthConfig

interface ContentFetchResponse<T> {
  success?: boolean
  status?: number
  data?: T
  error?: string
  code?: ApiErrorCode
}

const logger = createLogger("ApiTransportRequest")

// Throttle log endpoints (`/api/log*`) to reduce burst traffic that can trigger
// upstream rate limits (e.g. concurrent paging for usage + income).
const LOG_REQUEST_MIN_INTERVAL_MS = 200

const logRequestRateLimiter = createMinIntervalLimiter({
  minIntervalMs: isTestMode() ? 0 : LOG_REQUEST_MIN_INTERVAL_MS,
})

/**
 * Determine if a given endpoint string matches log API patterns.
 * - Accepts raw paths (e.g. "/api/log") or full URLs (e.g. "https://example.com/api/log").
 * - Matches only the exact "/api/log" path or paths under it.
 * - Ignores leading/trailing whitespace and query parameters.
 * @param endpoint Endpoint string to evaluate.
 * @returns true if the endpoint is a log API; false otherwise.
 */
function isLogApiEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false
  const trimmed = endpoint.trim()
  if (!trimmed) return false

  const [rawPath] = trimmed.split("?")
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`
  if (normalizedPath === "/api/log" || normalizedPath.startsWith("/api/log/")) {
    return true
  }

  try {
    const parsed = new URL(trimmed)
    return (
      parsed.pathname === "/api/log" || parsed.pathname.startsWith("/api/log/")
    )
  } catch {
    return false
  }
}
/**
 * Extract the origin (scheme + host + port) from a base URL for rate limiting keys.
 */
function resolveLogRateLimitKey(baseUrl: string): string {
  return normalizeUrlForOriginKey(baseUrl, { stripTrailingSlashes: true })
}

/**
 * Extract the canonical site origin used for process-local API request limiting.
 */
function resolveSiteRequestLimitKey(baseUrl: string): string {
  return normalizeUrlForOriginKey(baseUrl, {
    lowerCase: true,
    stripTrailingSlashes: true,
  })
}

/**
 * Enforce rate limits on log API requests to prevent upstream throttling.
 */
async function enforceLogRequestRateLimit(options: {
  baseUrl: string
  endpoint?: string
}): Promise<void> {
  if (!isLogApiEndpoint(options.endpoint)) return

  const key = resolveLogRateLimitKey(options.baseUrl)
  if (!key) return

  await logRequestRateLimiter(key)
}

/**
 * Build request headers for upstream API calls.
 *
 * Behavior:
 * - Adds extension + auth method headers (via cookieHelper).
 * - Injects multiple compatible user-id headers so different backends can read the user context.
 * - Adds Bearer token when provided.
 * - Optionally includes Cookie header when provided (best-effort; may be ignored by browser).
 * @param auth Auth context describing authentication and optional user identifier.
 * @returns Headers object ready for fetch.
 */
const createRequestHeaders = async (
  auth: NormalizedAuthContext,
): Promise<Record<string, string>> => {
  const baseHeaders = {
    "Content-Type": REQUEST_CONFIG.HEADERS.CONTENT_TYPE,
    Pragma: REQUEST_CONFIG.HEADERS.PRAGMA,
  }

  // Some deployments expect different header names; keep a fan-out map for compatibility.
  const userHeaders = buildCompatUserIdHeaders(auth.userId)

  let headers: Record<string, string> = { ...baseHeaders, ...userHeaders }

  headers = addExtensionHeader(headers)

  if (auth.authType === AuthTypeEnum.Cookie) {
    headers = await addAuthMethodHeader(headers, AUTH_MODE.COOKIE_AUTH_MODE)
  } else if (auth.authType === AuthTypeEnum.AccessToken) {
    headers = await addAuthMethodHeader(headers, AUTH_MODE.TOKEN_AUTH_MODE)
  }

  if (auth.accessToken) {
    headers["Authorization"] = `Bearer ${auth.accessToken}`
  }

  if (auth.authType === AuthTypeEnum.Cookie && auth.cookie) {
    headers["Cookie"] = auth.cookie

    // Preserve per-account session cookies when the Firefox interceptor is active.
    const hasCookieInterceptorHeader =
      COOKIE_AUTH_HEADER_NAME in headers &&
      headers[COOKIE_AUTH_HEADER_NAME] === AUTH_MODE.COOKIE_AUTH_MODE
    if (hasCookieInterceptorHeader) {
      headers[COOKIE_SESSION_OVERRIDE_HEADER_NAME] = auth.cookie
    }
  }

  return headers
}

/**
 * Build a base RequestInit with defaults.
 * @param headers Default headers to seed the request with.
 * @param credentials Fetch credentials policy (include/omit for cookies).
 * @param options Caller-provided overrides (method, body, headers, etc.).
 * @returns RequestInit merged with sensible defaults.
 */
const createBaseRequest = (
  headers: HeadersInit,
  credentials: RequestCredentials,
  options: RequestInit = {},
): RequestInit => {
  const method = (options.method ?? "GET").toUpperCase()
  const requestOptions = { ...options }
  delete requestOptions.credentials
  delete requestOptions.headers
  delete requestOptions.method

  const defaultHeaders: HeadersInit = {
    ...headers,
    // 非 GET 请求自动加 Content-Type
    ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
  }

  return {
    method,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}), // 用户自定义 headers 可覆盖默认值
    },
    credentials,
    ...requestOptions,
  }
}

/**
 * Checks whether a request can safely prefer the matched current tab transport.
 */
function isCurrentTabContentFetchEligible(params: {
  request: ApiTransportRequest
  url: string
  options: FetchApiOptions
}): boolean {
  if (params.options.currentTabTransport === "disabled") return false
  const responseType = params.options.responseType ?? "json"
  if (responseType !== "json" && responseType !== "text") return false

  const fetchContext = params.request.fetchContext
  if (fetchContext?.kind !== API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB)
    return false
  if (typeof fetchContext.tabId !== "number") return false

  try {
    const requestOrigin = new URL(params.url).origin
    const contextOrigin = new URL(fetchContext.origin).origin
    return requestOrigin === contextOrigin
  } catch {
    return false
  }
}

/**
 * Sends the prepared request through the matched tab's content script.
 */
async function fetchViaCurrentTabContent<T>(context: {
  fetchContext: Extract<
    ApiTransportFetchContext,
    { kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB }
  >
  url: string
  endpoint: string
  fetchOptions: RequestInit
  onlyData: boolean
  responseType: TempWindowResponseType
}): Promise<T | ApiResponse<T>> {
  const response = (await sendTabMessageWithRetry(context.fetchContext.tabId, {
    action: RuntimeActionIds.ContentPerformTempWindowFetch,
    requestId: safeRandomUUID(`current-tab-fetch-${context.url}`),
    fetchUrl: context.url,
    fetchOptions: normalizeRequestInitForMessage(context.fetchOptions),
    responseType: context.responseType,
  })) as ContentFetchResponse<ApiResponse<T> | T>

  if (!response?.success) {
    throw new ApiError(
      response?.error || "Current-tab content fetch failed",
      response?.status,
      context.endpoint,
      response?.code,
    )
  }

  const responseBody = response.data

  if (context.responseType === "json") {
    if (context.onlyData) {
      return extractDataFromApiResponseBody<T>(responseBody, context.endpoint)
    }
    return responseBody as ApiResponse<T>
  }

  return responseBody as T
}

/**
 * Runs current-tab content fetch first when eligible, then falls back normally.
 */
async function executeWithCurrentTabContentPreference<T>(
  context: {
    request: ApiTransportRequest
    url: string
    endpoint: string
    fetchOptions: RequestInit
    onlyData: boolean
    responseType: TempWindowResponseType
    options: FetchApiOptions
  },
  fallback: () => Promise<T | ApiResponse<T>>,
): Promise<T | ApiResponse<T>> {
  if (
    !isCurrentTabContentFetchEligible({
      request: context.request,
      url: context.url,
      options: context.options,
    })
  ) {
    return await fallback()
  }

  const fetchContext = context.request.fetchContext as Extract<
    ApiTransportFetchContext,
    { kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB }
  >

  try {
    return await fetchViaCurrentTabContent<T>({
      fetchContext,
      url: context.url,
      endpoint: context.endpoint,
      fetchOptions: context.fetchOptions,
      onlyData: context.onlyData,
      responseType: context.responseType,
    })
  } catch (error) {
    logger.debug("Current-tab content fetch failed; falling back", {
      endpoint: context.endpoint,
      url: context.url,
      error: getErrorMessage(error),
    })
    // Keep current-tab fallback behavior aligned with temp-window fallback for
    // now. If mutating-request replay becomes a real issue, handle it in the
    // shared transport-fallback layer instead of special-casing this path.
    return await fallback()
  }
}

/**
 * Create a RequestInit configured for cookie-based auth.
 * @param auth Auth context used to compute headers.
 * @param options Additional fetch options to merge.
 */
const createAuthRequest = async (
  auth: NormalizedAuthContext,
  options: RequestInit = {},
): Promise<RequestInit> => {
  const credentials: RequestCredentials =
    auth.authType === AuthTypeEnum.Cookie ? "include" : "omit"

  const normalizedOptions: RequestInit = {
    ...options,
    headers: normalizeHeaderInit(options.headers),
  }

  return createBaseRequest(
    await createRequestHeaders(auth),
    credentials,
    normalizedOptions,
  )
}

/**
 * Internal helper: call apiRequest and return data field.
 * Warning: For internal use; fetchApiData is the public entry.
 */
const apiRequestData = async <T>(
  url: string,
  options: RequestInit | undefined,
  endpoint: string | undefined,
  responseType: TempWindowResponseType,
): Promise<T> => {
  const res = (await apiRequest<T>(
    url,
    options,
    endpoint,
    responseType,
  )) as ApiResponse<T>

  return extractDataFromApiResponseBody(res, endpoint)
}

/**
 * Low-level API request helper.
 * - Returns ApiResponse<T> for JSON, raw parsed value otherwise.
 * - Raises ApiError on HTTP failure or content-type mismatch for JSON.
 */
const apiRequest = async <T>(
  url: string,
  options: RequestInit | undefined,
  endpoint: string | undefined,
  responseType: TempWindowResponseType,
): Promise<ApiResponse<T> | T> => {
  const response = await fetch(url, options)

  if (!response.ok) {
    let errorCode: ApiErrorCode = API_ERROR_CODES.HTTP_OTHER
    let errorMessage = `请求失败: ${response.status}`

    if (response.status === 401) {
      errorCode = API_ERROR_CODES.HTTP_401
    } else if (response.status === 403) {
      errorCode = API_ERROR_CODES.HTTP_403
    } else if (response.status === 429) {
      errorCode = API_ERROR_CODES.HTTP_429
    }

    if (
      responseType === "json" &&
      (response.status === 401 || response.status === 429)
    ) {
      const retryAfter =
        response.status === 429 ? response.headers.get("retry-after") : null
      const hasRetryAfter = response.status === 429 && retryAfter !== null

      if (!hasRetryAfter) {
        const contentType = response.headers.get("content-type") || ""
        const looksLikeHtml =
          /\btext\/html\b/i.test(contentType) ||
          /\bapplication\/xhtml\+xml\b/i.test(contentType)

        if (looksLikeHtml) {
          errorCode = API_ERROR_CODES.CONTENT_TYPE_MISMATCH
        }
      }
    }

    if (
      responseType === "json" &&
      errorCode !== API_ERROR_CODES.CONTENT_TYPE_MISMATCH
    ) {
      try {
        const responseBody = (await response.clone().json()) as Partial<
          ApiResponse<unknown>
        >
        if (
          responseBody &&
          typeof responseBody === "object" &&
          typeof responseBody.message === "string" &&
          responseBody.message.trim()
        ) {
          errorMessage = responseBody.message
        }
      } catch {
        // Keep the generic HTTP status message when the error body is not parseable JSON.
      }
    }

    throw new ApiError(errorMessage, response.status, endpoint, errorCode)
  }
  if (responseType === "json") {
    const contentType = response.headers.get("content-type") || ""

    if (contentType && !/\bjson\b/i.test(contentType)) {
      throw new ApiError(
        `响应 content type mismatch: expected JSON but got ${contentType}`,
        response.status,
        endpoint,
        API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
      )
    }
  }

  return await parseResponseByType<T>(response, responseType, endpoint)
}

/**
 * Core fetch helper that wires authentication, temp-window fallback, and
 * response parsing for all upstream API calls.
 * @param request Unified request DTO.
 * @param options Fetch options (endpoint/method/body/responseType).
 * @param onlyData When true, returns the `data` field directly (JSON only).
 * @returns ApiResponse<T>, raw payload, or data field based on flags.
 */
const _fetchApi = async <T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  onlyData: boolean = false,
) => {
  const responseType = options.responseType ?? "json"
  const { baseUrl, accountId } = request
  const userId = request.auth?.userId

  const url = joinUrl(baseUrl, options.endpoint)

  const resolvedAuth: NormalizedAuthContext = {
    authType: request.auth?.authType ?? AuthTypeEnum.None,
    userId: userId,
    accessToken: request.auth?.accessToken,
    cookie: request.auth?.cookie,
  }

  const fetchOptions = await createAuthRequest(resolvedAuth, {
    ...options.options,
    signal: options.options?.signal ?? request.abortSignal,
  })

  await enforceLogRequestRateLimit({ baseUrl, endpoint: options.endpoint })

  const context = {
    baseUrl: baseUrl,
    url,
    endpoint: options.endpoint,
    fetchOptions,
    onlyData,
    responseType,
    tempWindowFallback: options.tempWindowFallback,
    accountId,
    authType: resolvedAuth.authType,
    cookieAuthSessionCookie:
      request.auth?.cookie ?? request.cookieAuthSessionCookie,
    useIncognito: request.fetchContext?.incognito === true,
    cookieStoreId: request.fetchContext?.cookieStoreId,
    forceTempWindow:
      request.fetchContext?.incognito === true ||
      Boolean(request.fetchContext?.cookieStoreId),
  }

  if (context.forceTempWindow) {
    logger.debug(
      "Forcing temp-window fetch for browser-profile auto-detect context",
      {
        endpoint: options.endpoint,
        url,
        fetchContext: summarizeApiTransportFetchContext(request.fetchContext),
      },
    )
  }

  const executeRequest = async () => {
    const fallback = async () =>
      await executeWithTempWindowFallback(context, async () => {
        if (onlyData) {
          return await apiRequestData<T>(
            url,
            fetchOptions,
            options.endpoint,
            responseType,
          )
        }
        const response = await apiRequest<T>(
          url,
          fetchOptions,
          options.endpoint,
          responseType,
        )

        if (responseType === "json") {
          return response as ApiResponse<T>
        }

        return response as T
      })

    return await executeWithCurrentTabContentPreference<T>(
      {
        request,
        url,
        endpoint: options.endpoint,
        fetchOptions,
        onlyData,
        responseType,
        options,
      },
      fallback,
    )
  }

  if (request.bypassSiteRequestLimit) {
    return await executeRequest()
  }

  const siteRequestLimitKey = resolveSiteRequestLimitKey(baseUrl)

  return await withSiteApiRequestLimit(siteRequestLimitKey, executeRequest)
}

/**
 * Public helper: fetch API and return data (JSON only).
 */
export async function fetchApiData<T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
): Promise<T> {
  if (options.responseType && options.responseType !== "json") {
    throw new ApiError(
      t("messages:errors.api.onlyJsonSupported"),
      undefined,
      options.endpoint,
    )
  }
  return (await _fetchApi(
    request,
    { ...options, responseType: "json" },
    true,
  )) as T
}

/**
 * Public helper: fetch API.
 *
 * - Default: returns ApiResponse<T> for JSON, or the raw parsed value for non-JSON response types.
 * - When `_normalResponseType` is true: returns the "normal" payload type `T`. If upstream responds
 *   with a `{ success, message, data }` envelope, this unwraps and returns `data`.
 */
export function fetchApi<T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  _normalResponseType: true,
): Promise<T>
export function fetchApi<T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  _normalResponseType?: false,
): Promise<ApiResponse<T> | T>
export async function fetchApi<T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  _normalResponseType?: boolean,
): Promise<T | ApiResponse<T>> {
  const response = await _fetchApi<T>(request, options)
  const responseType = options.responseType ?? "json"
  if (!_normalResponseType) {
    if (responseType !== "json") {
      return response as T
    }
    return response as ApiResponse<T>
  }

  if (responseType !== "json") {
    return response as T
  }

  const isApiResponseBody = (value: unknown): value is ApiResponse<unknown> => {
    if (!value || typeof value !== "object") return false
    const record = value as Record<string, unknown>
    return (
      typeof record.success === "boolean" &&
      typeof record.message === "string" &&
      "data" in record
    )
  }

  if (isApiResponseBody(response)) {
    return extractDataFromApiResponseBody<T>(response, options.endpoint)
  }

  return response as T
}

/**
 * Parse a fetch Response into the expected shape based on responseType.
 * @param response Raw fetch response.
 * @param responseType Desired output type (json/text/blob/arrayBuffer).
 * @returns Parsed payload typed to caller expectation.
 */
async function parseResponseByType<T>(
  response: Response,
  responseType: TempWindowResponseType,
  endpoint?: string,
): Promise<ApiResponse<T> | T> {
  switch (responseType) {
    case "text":
      return (await response.text()) as T
    case "arrayBuffer":
      return (await response.arrayBuffer()) as T
    case "blob":
      return (await response.blob()) as T
    case "json":
    default:
      try {
        return (await response.json()) as ApiResponse<T>
      } catch {
        throw new ApiError(
          t("messages:errors.api.invalidResponseFormat"),
          response.status,
          endpoint,
          API_ERROR_CODES.JSON_PARSE_ERROR,
        )
      }
  }
}
