import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import type {
  ApiResponse,
  LogItem,
  TodayUsageData
} from "~/services/apiService/common/type"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type TempWindowFallbackPreferences
} from "~/services/userPreferences"
import { AuthTypeEnum } from "~/types"
import {
  isExtensionPopup,
  isExtensionSidePanel,
  isFirefox,
  OPTIONS_PAGE_URL
} from "~/utils/browser.ts"
import {
  tempWindowFetch,
  type TempWindowFetchParams,
  type TempWindowResponseType
} from "~/utils/browserApi"
import { addExtensionHeader } from "~/utils/cookieHelper"
import { joinUrl } from "~/utils/url"

/**
 * 创建请求头
 */
const createRequestHeaders = (
  userId?: number | string,
  accessToken?: string
): Record<string, string> => {
  const baseHeaders = {
    "Content-Type": REQUEST_CONFIG.HEADERS.CONTENT_TYPE,
    Pragma: REQUEST_CONFIG.HEADERS.PRAGMA
  }

  const userHeaders: Record<string, string> = userId
    ? {
        "New-API-User": userId.toString(),
        "Veloera-User": userId.toString(),
        "voapi-user": userId.toString(),
        "User-id": userId.toString(),
        "Rix-Api-User": userId.toString(),
        "neo-api-user": userId.toString()
      }
    : {}

  const headers: Record<string, string> = { ...baseHeaders, ...userHeaders }
  // TODO：bug，还是带上了 cookie，导致网站没有使用 access_token进行验证
  if (accessToken) {
    headers["Cookie"] = "" // 使用 Bearer token 时清空 Cookie 头
    headers["Authorization"] = `Bearer ${accessToken}`
  }

  return headers
}

/**
 * 创建基本请求配置
 * @param headers 请求头
 * @param credentials 请求凭证信息
 * @param options 可选，请求配置
 * @returns RequestInit - 基本请求配置
 */
const createBaseRequest = (
  headers: HeadersInit,
  credentials: RequestCredentials,
  options: RequestInit = {}
): RequestInit => {
  const method = (options.method ?? "GET").toUpperCase()

  const defaultHeaders: HeadersInit = {
    ...headers,
    // 非 GET 请求自动加 Content-Type
    ...(method !== "GET" ? { "Content-Type": "application/json" } : {})
  }

  return {
    method,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}) // 用户自定义 headers 可覆盖默认值
    },
    credentials,
    ...options
  }
}

/**
 * 创建带 cookie 认证的请求
 */
const createCookieAuthRequest = (
  userId: number | string | undefined,
  options: RequestInit = {}
): RequestInit => {
  const baseRequest = createBaseRequest(
    createRequestHeaders(userId),
    "include",
    options
  )

  // Firefox：为 Cookie 认证请求添加扩展标识头
  if (isFirefox()) {
    baseRequest.headers = addExtensionHeader(baseRequest.headers)
  }

  return baseRequest
}

/**
 * 创建带 Bearer token 认证的请求
 */
const createTokenAuthRequest = (
  userId: number | string | undefined,
  accessToken: string,
  options: RequestInit = {}
): RequestInit =>
  createBaseRequest(createRequestHeaders(userId, accessToken), "omit", options)

/**
 * 计算今日时间戳范围
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
 * 聚合使用量数据
 */
export const aggregateUsageData = (
  items: LogItem[]
): Omit<TodayUsageData, "today_requests_count"> => {
  return items.reduce(
    (acc, item) => ({
      today_quota_consumption: acc.today_quota_consumption + (item.quota || 0),
      today_prompt_tokens: acc.today_prompt_tokens + (item.prompt_tokens || 0),
      today_completion_tokens:
        acc.today_completion_tokens + (item.completion_tokens || 0)
    }),
    {
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0
    }
  )
}

/**
 * 基于 apiRequest 的快捷函数：直接提取 data
 * @waring 非必要请勿在外部使用
 * @see fetchApi fetchApiData
 */
const apiRequestData = async <T>(
  url: string,
  options: RequestInit | undefined,
  endpoint: string | undefined,
  responseType: TempWindowResponseType
): Promise<T> => {
  if (responseType !== "json") {
    throw new ApiError("仅支持 JSON 响应数据", undefined, endpoint)
  }

  const res = (await apiRequest<T>(
    url,
    options,
    endpoint,
    responseType
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
 * 通用 API 请求函数
 * @param url 请求 URL
 * @param options 请求配置
 * @param endpoint 可选，接口名称，用于错误追踪
 * @param responseType
 * @returns ApiResponse 对象
 * 默认：返回完整响应，不提取 data
 * @waring 非必要请勿在外部使用
 * @see fetchApi fetchApiData
 */
const apiRequest = async <T>(
  url: string,
  options: RequestInit | undefined,
  endpoint: string | undefined,
  responseType: TempWindowResponseType
): Promise<ApiResponse<T> | T> => {
  const response = await fetch(url, options)

  if (!response.ok) {
    throw new ApiError(
      `请求失败: ${response.status}`,
      response.status,
      endpoint
    )
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

const _fetchApi = async <T>(
  {
    baseUrl,
    endpoint,
    userId,
    token,
    authType,
    options,
    responseType = "json"
  }: FetchApiParams,
  onlyData: boolean = false
) => {
  const url = joinUrl(baseUrl, endpoint)
  let authOptions = {}
  switch (authType) {
    case AuthTypeEnum.Cookie:
      authOptions = createCookieAuthRequest(userId)
      break
    case AuthTypeEnum.AccessToken:
      authOptions = createTokenAuthRequest(userId, token!)
      break
    case AuthTypeEnum.None:
      authOptions = {}
      break
    default:
      if (token) {
        authOptions = createTokenAuthRequest(userId, token!)
      }
      break
  }

  const fetchOptions = {
    ...authOptions,
    ...options
  }

  const context: TempWindowFallbackContext = {
    baseUrl,
    url,
    endpoint,
    fetchOptions,
    onlyData,
    responseType
  }

  return await executeWithTempWindowFallback(context, async () => {
    if (onlyData) {
      return await apiRequestData<T>(url, fetchOptions, endpoint, responseType)
    }
    const response = await apiRequest<T>(
      url,
      fetchOptions,
      endpoint,
      responseType
    )

    if (responseType === "json") {
      return response as ApiResponse<T>
    }

    return response as T
  })
}

/**
 * 通用 API 请求函数，直接返回 data
 * @param params
 */
export const fetchApiData = async <T>(params: FetchApiParams): Promise<T> => {
  if (params.responseType && params.responseType !== "json") {
    throw new ApiError(
      "fetchApiData 仅支持 JSON 响应",
      undefined,
      params.endpoint
    )
  }
  return (await _fetchApi({ ...params, responseType: "json" }, true)) as T
}

export function fetchApi<T>(
  params: FetchApiParams,
  _normalResponseType: true
): Promise<T>
export function fetchApi<T>(
  params: FetchApiParams,
  _normalResponseType?: false
): Promise<ApiResponse<T>>

/**
 * 通用 API 请求函数
 * @param params
 * @param _normalResponseType
 */
export async function fetchApi<T>(
  params: FetchApiParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _normalResponseType?: boolean
): Promise<T | ApiResponse<T>> {
  return await _fetchApi(params)
}

const TEMP_WINDOW_FALLBACK_STATUS = new Set([401, 403, 429])

interface TempWindowFallbackContext {
  baseUrl: string
  url: string
  endpoint?: string
  fetchOptions: RequestInit
  onlyData: boolean
  responseType: TempWindowResponseType
}

function logSkipTempWindowFallback(
  message: string,
  context: TempWindowFallbackContext,
  extra?: Record<string, unknown>
): void {
  try {
    const location = context.endpoint
      ? `endpoint "${context.endpoint}"`
      : `url ${context.url}`

    const base = `[API Service] Temp window fallback skipped for ${location}: ${message}`

    if (extra && Object.keys(extra).length > 0) {
      console.log(base, extra)
    } else {
      console.log(base)
    }
  } catch {
    // ignore logging errors
  }
}

async function executeWithTempWindowFallback<T>(
  context: TempWindowFallbackContext,
  primaryRequest: () => Promise<T | ApiResponse<T>>
): Promise<T | ApiResponse<T>> {
  try {
    return await primaryRequest()
  } catch (error) {
    if (!(await shouldUseTempWindowFallback(error, context))) {
      throw error
    }

    return await fetchViaTempWindow<T>(context)
  }
}

async function shouldUseTempWindowFallback(
  error: unknown,
  context: TempWindowFallbackContext
): Promise<boolean> {
  if (!(error instanceof ApiError)) {
    logSkipTempWindowFallback(
      "Error is not an ApiError instance; treating as normal network/other error.",
      context,
      { error }
    )
    return false
  }

  if (!error.statusCode || !TEMP_WINDOW_FALLBACK_STATUS.has(error.statusCode)) {
    logSkipTempWindowFallback(
      "HTTP status is not in the fallback set (only 401/403/429 trigger shield).",
      context,
      {
        statusCode: error.statusCode
      }
    )
    return false
  }

  if (!isHttpUrl(context.baseUrl)) {
    logSkipTempWindowFallback(
      "Base URL is not HTTP/HTTPS; temp window fallback only supports http(s).",
      context,
      {
        baseUrl: context.baseUrl
      }
    )
    return false
  }

  if (!context.fetchOptions) {
    logSkipTempWindowFallback(
      "Missing fetch options; cannot safely re-issue request via temp window.",
      context
    )
    return false
  }

  try {
    if (typeof window !== "undefined" && isFirefox() && isExtensionPopup()) {
      logSkipTempWindowFallback(
        "Running in Firefox popup; temp window fallback is forcibly disabled to avoid closing the popup.",
        context
      )
      return false
    }
  } catch {
    // ignore environment detection errors
  }

  let prefsFallback: TempWindowFallbackPreferences | undefined
  try {
    const prefs = await userPreferences.getPreferences()
    prefsFallback =
      (prefs.tempWindowFallback as TempWindowFallbackPreferences | undefined) ??
      (DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences)
  } catch {
    prefsFallback =
      DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences
  }

  if (!prefsFallback || !prefsFallback.enabled) {
    logSkipTempWindowFallback(
      "Temp window shield is disabled or preferences are missing.",
      context,
      {
        enabled: prefsFallback?.enabled ?? null
      }
    )
    return false
  }

  const isBackground =
    typeof window === "undefined" || typeof document === "undefined"

  let inPopup = false
  let inSidePanel = false
  let inOptions = false

  if (!isBackground) {
    try {
      if (isExtensionPopup()) {
        inPopup = true
      } else if (isExtensionSidePanel()) {
        inSidePanel = true
      } else if (typeof window !== "undefined") {
        const href = window.location?.href || ""
        if (href && href.startsWith(OPTIONS_PAGE_URL)) {
          inOptions = true
        }
      }
    } catch {
      // ignore environment detection errors
    }
  }

  const isAutoRefreshContext = isBackground
  const isManualRefreshContext = !isBackground

  if (inPopup && !prefsFallback.useInPopup) {
    logSkipTempWindowFallback(
      "Popup context is disabled by user shield preferences.",
      context
    )
    return false
  }
  if (inSidePanel && !prefsFallback.useInSidePanel) {
    logSkipTempWindowFallback(
      "Side panel context is disabled by user shield preferences.",
      context
    )
    return false
  }
  if (inOptions && !prefsFallback.useInOptions) {
    logSkipTempWindowFallback(
      "Options page context is disabled by user shield preferences.",
      context
    )
    return false
  }

  if (isAutoRefreshContext && !prefsFallback.useForAutoRefresh) {
    logSkipTempWindowFallback(
      "Auto-refresh context is disabled by user shield preferences.",
      context
    )
    return false
  }
  if (isManualRefreshContext && !prefsFallback.useForManualRefresh) {
    logSkipTempWindowFallback(
      "Manual refresh context is disabled by user shield preferences.",
      context
    )
    return false
  }

  return true
}

async function fetchViaTempWindow<T>(
  context: TempWindowFallbackContext
): Promise<T | ApiResponse<T>> {
  const { fetchOptions, responseType } = context

  if (!fetchOptions) {
    throw new ApiError(
      "Temp window fetch fallback is not supported for current request",
      undefined,
      context.endpoint
    )
  }

  const requestPayload: TempWindowFetchParams = {
    originUrl: context.baseUrl,
    fetchUrl: context.url,
    fetchOptions,
    responseType,
    requestId: `temp-fetch-${Date.now()}`
  }

  console.log("[API Service] Using temp window fetch fallback for", context.url)

  const response = await tempWindowFetch(requestPayload)

  console.log("[API Service] Temp window fetch response:", response)

  if (!response.success) {
    throw new ApiError(
      response.error || "Temp window fetch failed",
      response.status,
      context.endpoint
    )
  }

  const responseBody = response.data

  if (responseType === "json") {
    if (context.onlyData) {
      return extractDataFromApiResponseBody<T>(responseBody, context.endpoint)
    }
    return responseBody as ApiResponse<T>
  }

  return responseBody as T
}

async function parseResponseByType<T>(
  response: Response,
  responseType: TempWindowResponseType
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

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch (error) {
    console.warn("Invalid URL for temp window fallback:", url, error)
    return false
  }
}

function extractDataFromApiResponseBody<T>(body: any, endpoint?: string): T {
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
 * 从文本中提取金额及货币符号
 * @param {string} text - 输入文本
 * @param exchangeRate - （CNY per USD）
 */
export function extractAmount(
  text: string,
  exchangeRate: number
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
