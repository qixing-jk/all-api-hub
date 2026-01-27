import i18next from "i18next"

import { accountStorage } from "~/services/accountStorage"
import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiService/common/errors"
import type {
  ApiResponse,
  ApiServiceRequest,
  AuthConfig,
  FetchApiOptions,
  LogItem,
  TodayUsageData,
} from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"
import {
  addAuthMethodHeader,
  addExtensionHeader,
  AUTH_MODE,
  COOKIE_AUTH_HEADER_NAME,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
} from "~/utils/cookieHelper"
import { createLogger } from "~/utils/logger"
import {
  executeWithTempWindowFallback,
  TempWindowFallbackContext,
  TempWindowResponseType,
} from "~/utils/tempWindowFetch"
import { joinUrl } from "~/utils/url"

type NormalizedAuthContext = AuthConfig

const logger = createLogger("ApiServiceUtils")

/**
 * Build request headers for New API calls.
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
  const userHeaders: Record<string, string> = auth.userId
    ? {
        "New-API-User": auth.userId.toString(),
        "Veloera-User": auth.userId.toString(),
        "voapi-user": auth.userId.toString(),
        "User-id": auth.userId.toString(),
        "Rix-Api-User": auth.userId.toString(),
        "neo-api-user": auth.userId.toString(),
      }
    : {}

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
    ...options,
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

  return createBaseRequest(
    await createRequestHeaders(auth),
    credentials,
    options,
  )
}

/**
 * Compute today's start/end unix timestamps (seconds).
 * @returns Object with start and end seconds for the current day.
 */
export const getTodayTimestampRange = (): { start: number; end: number } => {
  const today = new Date()

  // 今日开始时间戳
  today.setHours(0, 0, 0, 0)
  const start = Math.floor(today.getTime() / 1000)

  // 今日结束时间戳
  today.setHours(23, 59, 59, 999)
  const end = Math.floor(today.getTime() / 1000)

  return { start, end }
}

/**
 * Aggregate usage data over log items (quota + tokens).
 * @param items Log records to sum.
 * @returns Totals for quota and token counts.
 */
export const aggregateUsageData = (
  items: LogItem[],
): Omit<TodayUsageData, "today_requests_count"> => {
  return items.reduce(
    (acc, item) => ({
      today_quota_consumption: acc.today_quota_consumption + (item.quota || 0),
      today_prompt_tokens: acc.today_prompt_tokens + (item.prompt_tokens || 0),
      today_completion_tokens:
        acc.today_completion_tokens + (item.completion_tokens || 0),
    }),
    {
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
    },
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
  if (responseType !== "json") {
    throw new ApiError(
      i18next.t("messages:errors.api.onlyJsonSupported"),
      undefined,
      endpoint,
    )
  }

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

    if (response.status === 401) {
      errorCode = API_ERROR_CODES.HTTP_401
    } else if (response.status === 403) {
      errorCode = API_ERROR_CODES.HTTP_403
    } else if (response.status === 429) {
      errorCode = API_ERROR_CODES.HTTP_429
    }

    throw new ApiError(
      `请求失败: ${response.status}`,
      response.status,
      endpoint,
      errorCode,
    )
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

  return await parseResponseByType<T>(response, responseType)
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
  request: ApiServiceRequest,
  options: FetchApiOptions,
  onlyData: boolean = false,
) => {
  const responseType = options.responseType ?? "json"
  const { baseUrl, accountId } = request
  const userId = request.auth?.userId

  let accountInfo = null
  if (!accountId) {
    logger.warn("fetchApi called without accountId in request", {
      baseUrl,
      userId,
      endpoint: options.endpoint,
      authType: request.auth?.authType ?? AuthTypeEnum.None,
      hasAccessToken: Boolean(request.auth?.accessToken),
      hasCookie: Boolean(request.auth?.cookie),
    })
    accountInfo = await accountStorage.getAccountByBaseUrlAndUserId(
      baseUrl,
      userId,
    )
  }

  const url = joinUrl(baseUrl, options.endpoint)

  const resolvedAuth: NormalizedAuthContext = {
    authType: request.auth?.authType ?? AuthTypeEnum.None,
    userId: userId,
    accessToken: request.auth?.accessToken,
    cookie: request.auth?.cookie,
  }

  const fetchOptions = await createAuthRequest(resolvedAuth, options.options)

  const context: TempWindowFallbackContext = {
    baseUrl: baseUrl,
    url,
    endpoint: options.endpoint,
    fetchOptions,
    onlyData,
    responseType,
    accountId: accountId ?? accountInfo?.id,
    authType: resolvedAuth.authType,
    cookieAuthSessionCookie:
      request.auth?.cookie ?? accountInfo?.cookieAuth?.sessionCookie,
  }

  return await executeWithTempWindowFallback(context, async () => {
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
}

/**
 * Public helper: fetch API and return data (JSON only).
 */
export async function fetchApiData<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
): Promise<T> {
  if (options.responseType && options.responseType !== "json") {
    throw new ApiError(
      "fetchApiData 仅支持 JSON 响应",
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
 * Public helper: fetch API; returns ApiResponse<T> for JSON or raw for others.
 */
export function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType: true,
): Promise<T>
export function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType?: false,
): Promise<ApiResponse<T>>
export async function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _normalResponseType?: boolean,
): Promise<T | ApiResponse<T>> {
  return await _fetchApi(request, options)
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
      return (await response.json()) as ApiResponse<T>
  }
}

/**
 * Validate whether a string is an HTTP(S) URL.
 * @param url Candidate URL string.
 * @returns true when protocol is http/https; false on invalid or other schemes.
 */
export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch (error) {
    logger.warn("Invalid URL for temp window fallback", { url, error })
    return false
  }
}

/**
 * Extract the `data` field from a JSON API response, throwing on invalid shape.
 * @param body Parsed JSON body from upstream.
 * @param endpoint Optional endpoint for richer error context.
 * @returns Extracted `data` payload cast to T.
 */
export function extractDataFromApiResponseBody<T>(
  body: any,
  endpoint?: string,
): T {
  const invalidResponseMessage = i18next.t(
    "messages:errors.api.invalidResponseFormat",
  )

  if (!body || typeof body !== "object") {
    throw new ApiError(invalidResponseMessage, undefined, endpoint)
  }

  if (body.success === false) {
    const message = body.message || invalidResponseMessage
    throw new ApiError(message, undefined, endpoint)
  }

  return body.data as T
}

/**
 * Extract currency symbol and numeric amount from a free-form string.
 * @param text Input text containing currency and amount.
 * @param exchangeRate CNY per USD exchange rate for ¥ normalization.
 * @returns Symbol and USD amount when detected; otherwise null.
 */
export function extractAmount(
  text: string,
  exchangeRate: number,
): { currencySymbol: string; amount: number } | null {
  // \p{Sc} 支持所有 Unicode 货币符号
  const regex = /([\p{Sc}])\s*([\d,]+(?:\.\d+)?)/u
  const match = text.match(regex)

  if (!match) return null

  const currencySymbol = match[1] // 货币符号，如 $、€、¥
  let amount = parseFloat(match[2].replace(/,/g, "")) // 数字金额

  // 如果是人民币
  if (currencySymbol === "¥") {
    amount = amount / exchangeRate
  }

  return { currencySymbol, amount }
}
