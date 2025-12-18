import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiService/common/errors"
import type {
  ApiResponse,
  LogItem,
  TodayUsageData,
} from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"
import {
  addAuthMethodHeader,
  addExtensionHeader,
  AUTH_MODE,
  AuthMode,
} from "~/utils/cookieHelper"
import {
  executeWithTempWindowFallback,
  TempWindowFallbackContext,
  TempWindowResponseType,
} from "~/utils/tempWindowFetch"
import { joinUrl } from "~/utils/url"

/**
 * Build request headers for New API calls.
 *
 * Behavior:
 * - Adds extension + auth method headers (via cookieHelper).
 * - Injects multiple compatible user-id headers so different backends can read the user context.
 * - Adds Bearer token when provided.
 * @param authMode Auth strategy used to add auth headers.
 * @param userId Optional user identifier injected under several header keys.
 * @param accessToken Optional bearer token for token auth flows.
 * @returns Headers object ready for fetch.
 */
const createRequestHeaders = async (
  authMode: AuthMode,
  userId?: number | string,
  accessToken?: string,
): Promise<Record<string, string>> => {
  const baseHeaders = {
    "Content-Type": REQUEST_CONFIG.HEADERS.CONTENT_TYPE,
    Pragma: REQUEST_CONFIG.HEADERS.PRAGMA,
  }

  // Some deployments expect different header names; keep a fan-out map for compatibility.
  const userHeaders: Record<string, string> = userId
    ? {
        "New-API-User": userId.toString(),
        "Veloera-User": userId.toString(),
        "voapi-user": userId.toString(),
        "User-id": userId.toString(),
        "Rix-Api-User": userId.toString(),
        "neo-api-user": userId.toString(),
      }
    : {}

  let headers: Record<string, string> = { ...baseHeaders, ...userHeaders }

  headers = await addAuthMethodHeader(addExtensionHeader(headers), authMode)

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`
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
 * @param userId Optional user id to embed in headers.
 * @param options Additional fetch options to merge.
 */
const createCookieAuthRequest = async (
  userId: number | string | undefined,
  options: RequestInit = {},
): Promise<RequestInit> => {
  return createBaseRequest(
    await createRequestHeaders(AUTH_MODE.COOKIE_AUTH_MODE, userId, undefined),
    "include",
    options,
  )
}

/**
 * Create a RequestInit configured for bearer-token auth.
 * @param userId Optional user id to embed in headers.
 * @param accessToken Bearer token for Authorization header.
 * @param options Additional fetch options to merge.
 */
const createTokenAuthRequest = async (
  userId: number | string | undefined,
  accessToken: string | undefined,
  options: RequestInit = {},
): Promise<RequestInit> =>
  createBaseRequest(
    await createRequestHeaders(AUTH_MODE.TOKEN_AUTH_MODE, userId, accessToken),
    "omit",
    options,
  )

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
    throw new ApiError("仅支持 JSON 响应数据", undefined, endpoint)
  }

  const res = (await apiRequest<T>(
    url,
    options,
    endpoint,
    responseType,
  )) as ApiResponse<T>

  if (!res.success || res.data === undefined) {
    if (res.message) {
      throw new ApiError(res.message, undefined, endpoint)
    }
    throw new ApiError("响应数据格式错误", undefined, endpoint)
  }

  return res.data
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

// 通用请求函数
export interface FetchApiParams {
  baseUrl: string
  endpoint: string
  userId?: number | string
  token?: string
  authType?: AuthTypeEnum // 认证方式，默认 token
  options?: RequestInit // 可额外自定义 fetch 参数
  responseType?: TempWindowResponseType // 默认 json，可自定义响应处理
}

/**
 * Core fetch helper that wires authentication, temp-window fallback, and
 * response parsing for all upstream API calls.
 * @param params Fetch configuration (baseUrl, endpoint, auth, etc.).
 * @param onlyData When true, returns the `data` field directly (JSON only).
 * @returns ApiResponse<T>, raw payload, or data field based on flags.
 */
const _fetchApi = async <T>(
  {
    baseUrl,
    endpoint,
    userId,
    token,
    authType,
    options,
    responseType = "json",
  }: FetchApiParams,
  onlyData: boolean = false,
) => {
  const url = joinUrl(baseUrl, endpoint)
  let authOptions = {}
  switch (authType) {
    case AuthTypeEnum.Cookie:
      authOptions = await createCookieAuthRequest(userId, options)
      break
    case AuthTypeEnum.AccessToken:
      authOptions = await createTokenAuthRequest(userId, token)
      break
    case AuthTypeEnum.None:
      authOptions = {
        credentials: "omit",
      }
      break
    default:
      if (token) {
        authOptions = await createTokenAuthRequest(userId, token)
      }
      break
  }

  const fetchOptions = {
    ...authOptions,
    ...options,
  }

  const context: TempWindowFallbackContext = {
    baseUrl,
    url,
    endpoint,
    fetchOptions,
    onlyData,
    responseType,
  }

  return await executeWithTempWindowFallback(context, async () => {
    if (onlyData) {
      return await apiRequestData<T>(url, fetchOptions, endpoint, responseType)
    }
    const response = await apiRequest<T>(
      url,
      fetchOptions,
      endpoint,
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
export const fetchApiData = async <T>(params: FetchApiParams): Promise<T> => {
  if (params.responseType && params.responseType !== "json") {
    throw new ApiError(
      "fetchApiData 仅支持 JSON 响应",
      undefined,
      params.endpoint,
    )
  }
  return (await _fetchApi({ ...params, responseType: "json" }, true)) as T
}

/**
 * Public helper: fetch API; returns ApiResponse<T> for JSON or raw for others.
 */
export function fetchApi<T>(
  params: FetchApiParams,
  _normalResponseType: true,
): Promise<T>
export function fetchApi<T>(
  params: FetchApiParams,
  _normalResponseType?: false,
): Promise<ApiResponse<T>>

export async function fetchApi<T>(
  params: FetchApiParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _normalResponseType?: boolean,
): Promise<T | ApiResponse<T>> {
  return await _fetchApi(params)
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
    console.warn("Invalid URL for temp window fallback:", url, error)
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
  if (!body || typeof body !== "object") {
    throw new ApiError("响应数据格式错误", undefined, endpoint)
  }

  if (body.success === false || body.data === undefined) {
    const message = body.message || "响应数据格式错误"
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
