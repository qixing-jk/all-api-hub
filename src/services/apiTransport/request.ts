import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  composeAbortSignals,
  startAbortableTask,
} from "~/services/apiTransport/abortableTask"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import { createMinIntervalLimiter } from "~/services/apiTransport/minIntervalLimiter"
import {
  isReplaySafeRemoteFetch,
  observeRemoteFetchLifecycle,
} from "~/services/apiTransport/remoteLifecycle"
import { extractDataFromApiResponseBody } from "~/services/apiTransport/response"
import {
  resolveSiteRequestLimitKey,
  withSiteApiRequestLease,
} from "~/services/apiTransport/siteRequestLimiter"
import type {
  ApiAuthTokenMode,
  ApiResponse,
  ApiTransportFetchContext,
  ApiTransportRequest,
  ApiTransportRequestObserver,
  ApiTransportResponse,
  AuthConfig,
  FetchApiOptions,
} from "~/services/apiTransport/type"
import {
  API_AUTH_TOKEN_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  summarizeApiTransportFetchContext,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import type {
  TempWindowFetch,
  TempWindowResponseType,
} from "~/types/tempWindowFetch"
import {
  isMessageReceiverUnavailableError,
  sendTabMessageWithRetry,
} from "~/utils/browser/browserApi"
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

type JsonFetchApiOptions = Omit<FetchApiOptions, "responseType"> & {
  responseType?: "json"
}

type NonJsonFetchApiOptions = Omit<FetchApiOptions, "responseType"> & {
  responseType: Exclude<TempWindowResponseType, "json">
}

type NormalizedAuthContext = AuthConfig

interface AcquiredTransportResponse<T> extends ApiTransportResponse<T> {
  decodeError?: ApiError
}

type TransportResponseMapper<T, TResult> = (
  response: AcquiredTransportResponse<T>,
) => TResult | Promise<TResult>

type MessageResponseMapper<TResult> = (
  response: TempWindowFetch,
) => TResult | Promise<TResult>

interface ContentFetchResponse<T> {
  success?: boolean
  status?: number
  headers?: Record<string, string>
  data?: T
  error?: string
  code?: ApiErrorCode
}

/** Copies the controlled message response fields before lifecycle disposal. */
function snapshotContentFetchResponse<T>(
  value: unknown,
): ContentFetchResponse<T> {
  if (!value || typeof value !== "object") return {}
  const response = value as ContentFetchResponse<T>
  return {
    success: response.success,
    status: response.status,
    headers: response.headers,
    data: response.data,
    error: response.error,
    code: response.code,
  }
}

/** Redacts the exact request credential before emitting transport diagnostics. */
function getSafeTransportErrorMessage(
  error: unknown,
  requestAccessToken: string | undefined,
): string {
  const message = getErrorMessage(error)
  if (!requestAccessToken?.trim()) return message
  return message.split(requestAccessToken).join("[REDACTED]")
}

const logger = createLogger("ApiTransportRequest")

type ApiTransportObserverEvent = keyof ApiTransportRequestObserver

/** Keeps optional lifecycle evidence best-effort and isolated from transport results. */
function notifyApiTransportObserver(
  observer: ApiTransportRequestObserver | undefined,
  event: ApiTransportObserverEvent,
): void {
  try {
    observer?.[event]()
  } catch {
    logger.warn("API transport observer callback failed", { event })
  }
}

interface BackendErrorDetails {
  message: string
  isBackendError: boolean
  upstreamCode?: string
}

// Throttle log endpoints (`/api/log*`) to reduce burst traffic that can trigger
// upstream rate limits (e.g. concurrent paging for usage + income).
const LOG_REQUEST_MIN_INTERVAL_MS = 200

const logRequestRateLimiter = createMinIntervalLimiter({
  minIntervalMs: isTestMode() ? 0 : LOG_REQUEST_MIN_INTERVAL_MS,
})

const getNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const KNOWN_BACKEND_ERROR_TYPES = new Set(["new_api_error"])

const isKnownBackendErrorType = (value: unknown): boolean =>
  typeof value === "string" && KNOWN_BACKEND_ERROR_TYPES.has(value.trim())

const getSafeUpstreamCode = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const code = String(value).trim()
  return code.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(code) ? code : undefined
}

/**
 * Extracts known backend-shaped JSON errors so they are not treated as
 * WAF/challenge 403s that temp-window fallback can recover.
 */
function extractBackendErrorDetails(body: unknown): BackendErrorDetails | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null
  }

  const topLevelMessage =
    getNonEmptyString((body as { message?: unknown }).message) ??
    getNonEmptyString((body as { msg?: unknown }).msg)
  if (topLevelMessage) {
    const code = (body as { code?: unknown }).code
    const isBusinessEnvelope =
      (typeof code === "number" && code !== 0) ||
      (typeof code === "string" && code.trim() !== "" && code.trim() !== "0")

    return {
      message: topLevelMessage,
      isBackendError: Boolean(
        (body as { success?: unknown }).success === false || isBusinessEnvelope,
      ),
    }
  }

  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return null
  }

  const message = getNonEmptyString((error as { message?: unknown }).message)
  if (!message) {
    return null
  }

  const isBackendError = isKnownBackendErrorType(
    (error as { type?: unknown }).type,
  )
  const upstreamCode = getSafeUpstreamCode((error as { code?: unknown }).code)

  return {
    message,
    isBackendError,
    upstreamCode,
  }
}

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
  authTokenMode: ApiAuthTokenMode,
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
    headers["Authorization"] =
      authTokenMode === API_AUTH_TOKEN_MODES.Raw
        ? auth.accessToken
        : `Bearer ${auth.accessToken}`
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
  responseType: TempWindowResponseType
  onDispatch: () => void
  onResponse: () => void
  onResponseInspectionError: () => void
}): Promise<AcquiredTransportResponse<T>> {
  const requestId = safeRandomUUID("current-tab-fetch")
  const lifecycle = observeRemoteFetchLifecycle(requestId, {
    onDispatch: context.onDispatch,
    onResponse: context.onResponse,
  })
  const replaySafe = isReplaySafeRemoteFetch(context.fetchOptions)
  const abortSignal = context.fetchOptions.signal
  let hasAffirmativePreDispatchEvidence = false
  const disposeLifecycle = () => lifecycle.dispose()
  const disposeAfterAbort = () => {
    if (!replaySafe && !hasAffirmativePreDispatchEvidence) {
      lifecycle.markPossiblyDispatched()
    }
    disposeLifecycle()
  }
  abortSignal?.addEventListener("abort", disposeAfterAbort, { once: true })

  try {
    let response: unknown
    try {
      response = await sendTabMessageWithRetry(context.fetchContext.tabId, {
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
        requestId,
        fetchUrl: context.url,
        fetchOptions: normalizeRequestInitForMessage(context.fetchOptions),
        responseType: context.responseType,
      })
    } catch (error) {
      if (!replaySafe && !isMessageReceiverUnavailableError(error)) {
        lifecycle.markPossiblyDispatched()
      }
      throw error
    }
    let responseSnapshot: ContentFetchResponse<ApiResponse<T> | T>
    try {
      hasAffirmativePreDispatchEvidence =
        lifecycle.applyResultEvidence(response).affirmativePreDispatch
      responseSnapshot = snapshotContentFetchResponse<ApiResponse<T> | T>(
        response,
      )
      if (
        !replaySafe &&
        !(
          responseSnapshot.success === false &&
          hasAffirmativePreDispatchEvidence
        )
      ) {
        lifecycle.markPossiblyDispatched()
      }
    } catch (error) {
      if (!replaySafe && !hasAffirmativePreDispatchEvidence) {
        lifecycle.markPossiblyDispatched()
      }
      context.onResponseInspectionError()
      throw error
    }

    const success = responseSnapshot.success
    if (typeof success !== "boolean") {
      throw new ApiError(
        responseSnapshot.error || "Current-tab content fetch failed",
        responseSnapshot.status,
        context.endpoint,
        responseSnapshot.code,
      )
    }

    const status = responseSnapshot.status ?? (success ? 200 : undefined)
    if (status === undefined) {
      throw new ApiError(
        responseSnapshot.error || "Current-tab content fetch failed",
        undefined,
        context.endpoint,
        responseSnapshot.code,
      )
    }

    return {
      ok: success,
      status,
      headers: responseSnapshot.headers ?? {},
      body: responseSnapshot.data as T,
    }
  } finally {
    abortSignal?.removeEventListener("abort", disposeAfterAbort)
    disposeLifecycle()
  }
}

/**
 * Runs current-tab content fetch first when eligible, then falls back normally.
 */
async function executeWithCurrentTabContentPreference<T, TResult>(
  context: {
    request: ApiTransportRequest
    url: string
    endpoint: string
    fetchOptions: RequestInit
    responseType: TempWindowResponseType
    options: FetchApiOptions
    onDispatch: () => void
    onResponse: () => void
    wasDispatched: () => boolean
  },
  mapResponse: TransportResponseMapper<T, TResult>,
  fallback: () => Promise<TResult>,
): Promise<TResult> {
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

  let response: AcquiredTransportResponse<T>
  let responseInspectionFailed = false
  try {
    response = await fetchViaCurrentTabContent<T>({
      fetchContext,
      url: context.url,
      endpoint: context.endpoint,
      fetchOptions: context.fetchOptions,
      responseType: context.responseType,
      onDispatch: context.onDispatch,
      onResponse: context.onResponse,
      onResponseInspectionError: () => {
        responseInspectionFailed = true
      },
    })
  } catch (error) {
    const replaySafe = isReplaySafeRemoteFetch(context.fetchOptions)
    const dispatched = context.wasDispatched()
    const mustNotFallback =
      responseInspectionFailed || (dispatched && !replaySafe)
    logger.debug(
      mustNotFallback
        ? "Current-tab content fetch failed without a safe fallback"
        : "Current-tab content fetch failed; falling back",
      {
        endpoint: context.endpoint,
        url: context.url,
        error: getSafeTransportErrorMessage(
          error,
          context.request.auth.accessToken,
        ),
      },
    )
    if (mustNotFallback) throw error
    return await fallback()
  }

  // Mapping happens after transport acquisition so an HTTP/application error
  // cannot replay a request that the current tab already dispatched.
  return await mapResponse(response)
}

/**
 * Create a RequestInit configured for cookie-based auth.
 * @param auth Auth context used to compute headers.
 * @param options Additional fetch options to merge.
 */
const createAuthRequest = async (
  auth: NormalizedAuthContext,
  options: RequestInit = {},
  authTokenMode: ApiAuthTokenMode = API_AUTH_TOKEN_MODES.Bearer,
): Promise<RequestInit> => {
  const credentials: RequestCredentials =
    auth.authType === AuthTypeEnum.Cookie ? "include" : "omit"

  const normalizedOptions: RequestInit = {
    ...options,
    headers: normalizeHeaderInit(options.headers),
  }

  return createBaseRequest(
    await createRequestHeaders(auth, authTokenMode),
    credentials,
    normalizedOptions,
  )
}

/** Collects response headers into the message-safe transport contract. */
function collectResponseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries())
}

/**
 * Performs one HTTP exchange and preserves the parsed body regardless of status.
 */
const apiRequestResponse = async <T>(
  url: string,
  options: RequestInit | undefined,
  endpoint: string | undefined,
  responseType: TempWindowResponseType,
  onResponse: () => void,
): Promise<AcquiredTransportResponse<T>> => {
  const response = await fetch(url, options)
  onResponse()
  const contentType = response.headers.get("content-type") || ""

  if (responseType === "json") {
    if (response.ok && contentType && !/\bjson\b/i.test(contentType)) {
      throw new ApiError(
        `响应 content type mismatch: expected JSON but got ${contentType}`,
        response.status,
        endpoint,
        API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
      )
    }
  }

  let body: T
  try {
    body =
      responseType === "json" &&
      !response.ok &&
      contentType &&
      !/\bjson\b/i.test(contentType)
        ? ((await response.text()) as T)
        : ((await parseResponseByType<T>(
            response,
            responseType,
            endpoint,
          )) as T)
  } catch (error) {
    if (
      !response.ok &&
      error instanceof ApiError &&
      error.code === API_ERROR_CODES.JSON_PARSE_ERROR
    ) {
      return {
        ok: false,
        status: response.status,
        headers: collectResponseHeaders(response.headers),
        body: undefined as T,
        decodeError: error,
      }
    }
    throw error
  }

  return {
    ok: response.ok,
    status: response.status,
    headers: collectResponseHeaders(response.headers),
    body,
  }
}

/** Converts an unsuccessful HTTP result into the legacy shared ApiError. */
function createCompatibilityHttpError(
  response: ApiTransportResponse<unknown>,
  endpoint: string,
  responseType: TempWindowResponseType,
): ApiError {
  let errorCode: ApiErrorCode = API_ERROR_CODES.HTTP_OTHER
  let errorMessage = `请求失败: ${response.status}`
  let backendError: BackendErrorDetails | null = null

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
      response.status === 429 ? response.headers["retry-after"] : undefined
    const hasRetryAfter = response.status === 429 && retryAfter !== undefined
    const contentType = response.headers["content-type"] || ""
    const looksLikeHtml =
      /\btext\/html\b/i.test(contentType) ||
      /\bapplication\/xhtml\+xml\b/i.test(contentType)

    if (!hasRetryAfter && looksLikeHtml) {
      errorCode = API_ERROR_CODES.CONTENT_TYPE_MISMATCH
    }
  }

  if (
    responseType === "json" &&
    errorCode !== API_ERROR_CODES.CONTENT_TYPE_MISMATCH
  ) {
    backendError = extractBackendErrorDetails(response.body)
    if (backendError) {
      if (backendError.isBackendError || response.status !== 403) {
        errorMessage = backendError.message
      }
      if (backendError.isBackendError && response.status === 403) {
        errorCode = API_ERROR_CODES.BUSINESS_ERROR
      }
    }
  }

  return new ApiError(
    errorMessage,
    response.status,
    endpoint,
    errorCode,
    backendError?.upstreamCode,
  )
}

/** Applies the existing envelope and error behavior above raw HTTP transport. */
function mapCompatibilityResponse<T>(
  response: AcquiredTransportResponse<T>,
  context: {
    endpoint: string
    responseType: TempWindowResponseType
    onlyData: boolean
  },
): T | ApiResponse<T> {
  if (!response.ok) {
    throw createCompatibilityHttpError(
      response,
      context.endpoint,
      context.responseType,
    )
  }

  if (response.decodeError) throw response.decodeError

  if (context.responseType === "json" && context.onlyData) {
    return extractDataFromApiResponseBody<T>(response.body, context.endpoint)
  }

  return response.body as T | ApiResponse<T>
}

/** Normalizes a message-channel fetch result without discarding its body. */
function normalizeMessageFetchResponse<T>(
  response: TempWindowFetch,
  endpoint: string,
): AcquiredTransportResponse<T> {
  const status = response.status ?? (response.success ? 200 : undefined)
  if (status === undefined) {
    throw new ApiError(
      response.error || "Extension fetch failed",
      undefined,
      endpoint,
      response.code,
    )
  }

  return {
    ok: response.success,
    status,
    headers: response.headers ?? {},
    body: response.data as T,
  }
}

/**
 * Core fetch helper that wires authentication, temp-window fallback, and
 * response parsing for all upstream API calls.
 * @param request Unified request DTO.
 * @param options Fetch options (endpoint/method/body/responseType).
 * @param onlyData When true, returns the `data` field directly (JSON only).
 * @returns ApiResponse<T>, raw payload, or data field based on flags.
 */
const _fetchApiWithMapper = async <T, TResult>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  onlyData: boolean,
  mapResponse: TransportResponseMapper<T, TResult>,
  mapTempWindowResponse: MessageResponseMapper<TResult>,
): Promise<TResult> => {
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

  const fetchOptions = await createAuthRequest(
    resolvedAuth,
    {
      ...options.options,
      signal: options.options?.signal ?? request.abortSignal,
    },
    options.authTokenMode,
  )

  await enforceLogRequestRateLimit({ baseUrl, endpoint: options.endpoint })

  const context = {
    baseUrl: baseUrl,
    url,
    endpoint: options.endpoint,
    fetchOptions,
    onlyData,
    responseType,
    tempWindowRequestSource: request.tempWindowRequestSource,
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

  const startRequest = () => {
    let taskFailure: { error: unknown } | undefined
    const execution = startAbortableTask(
      async (signal) => {
        try {
          request.abortDeadline?.start()
          let dispatchObserved = false
          const onDispatch = () => {
            if (dispatchObserved) return
            dispatchObserved = true
            notifyApiTransportObserver(request.observer, "onDispatch")
          }
          let responseObserved = false
          const onResponse = () => {
            if (responseObserved) return
            responseObserved = true
            notifyApiTransportObserver(request.observer, "onResponse")
          }
          const dispatchedFetchOptions = { ...fetchOptions, signal }
          const dispatchedContext = {
            ...context,
            fetchOptions: dispatchedFetchOptions,
          }
          const primaryRequest = async () => {
            onDispatch()
            const response = await apiRequestResponse<T>(
              url,
              dispatchedFetchOptions,
              options.endpoint,
              responseType,
              onResponse,
            )
            return await mapResponse(response)
          }
          const fallback = async () => {
            const execution = request.protectionBypassExecution
            if (!execution) {
              if (dispatchedContext.forceTempWindow) {
                throw new ApiError(
                  t("messages:background.tempWindowPolicyContextInvalid"),
                  undefined,
                  options.endpoint,
                  API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
                )
              }
              return await primaryRequest()
            }

            return await executeWithTempWindowFallback(
              {
                ...dispatchedContext,
                protectionBypassExecution: execution,
                transportLifecycleObserver: {
                  onDispatch,
                  onResponse,
                },
              },
              primaryRequest,
              mapTempWindowResponse,
            )
          }

          return await executeWithCurrentTabContentPreference<T, TResult>(
            {
              request,
              url,
              endpoint: options.endpoint,
              fetchOptions: dispatchedFetchOptions,
              responseType,
              options,
              onDispatch,
              onResponse,
              wasDispatched: () => dispatchObserved,
            },
            mapResponse,
            fallback,
          )
        } catch (error) {
          taskFailure = { error }
          throw error
        }
      },
      {
        signals: [
          fetchOptions.signal ?? undefined,
          request.abortDeadline?.signal,
        ],
        timeoutMs: request.abortDeadline ? undefined : request.requestTimeoutMs,
      },
    )
    return {
      ...execution,
      result: execution.result.catch((error) => {
        // A response getter can synchronously abort and then throw a more
        // specific inspection error before the abort race callback runs.
        if (taskFailure) throw taskFailure.error
        throw error
      }),
    }
  }

  if (request.bypassSiteRequestLimit) {
    return await startRequest().result
  }

  const siteRequestLimitKey = resolveSiteRequestLimitKey(baseUrl)
  const admissionAbort = composeAbortSignals([
    fetchOptions.signal ?? undefined,
    request.abortDeadline?.signal,
  ])

  try {
    return await withSiteApiRequestLease(
      siteRequestLimitKey,
      startRequest,
      admissionAbort.signal,
    )
  } finally {
    admissionAbort.dispose()
  }
}

/** Runs the existing compatibility semantics above the raw response result. */
const _fetchApi = async <T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  onlyData: boolean = false,
): Promise<T | ApiResponse<T>> => {
  const responseType = options.responseType ?? "json"
  return await _fetchApiWithMapper<T, T | ApiResponse<T>>(
    request,
    options,
    onlyData,
    (response) =>
      mapCompatibilityResponse(response, {
        endpoint: options.endpoint,
        responseType,
        onlyData,
      }),
    (response) => {
      if (!response.success) {
        throw new ApiError(
          response.error || "Temp window fetch failed",
          response.status,
          options.endpoint,
          response.code,
        )
      }
      return mapCompatibilityResponse(
        normalizeMessageFetchResponse<T>(response, options.endpoint),
        {
          endpoint: options.endpoint,
          responseType,
          onlyData,
        },
      )
    },
  )
}

/**
 * Returns the parsed response body and HTTP facts without provider semantics.
 */
export async function fetchApiResponse<T = unknown>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
): Promise<ApiTransportResponse<T>> {
  return await _fetchApiWithMapper<T, ApiTransportResponse<T>>(
    request,
    options,
    false,
    (response) => {
      if (response.decodeError) throw response.decodeError
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        body: response.body,
      }
    },
    (response) => normalizeMessageFetchResponse<T>(response, options.endpoint),
  )
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
  options: JsonFetchApiOptions,
  _normalResponseType?: false,
): Promise<ApiResponse<T>>
export function fetchApi<T>(
  request: ApiTransportRequest,
  options: NonJsonFetchApiOptions,
  _normalResponseType?: false,
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
