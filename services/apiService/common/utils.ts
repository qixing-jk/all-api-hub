import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
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
 * 创建请求头
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
 * 创建基本请求配置
 * @param headers 请求头
 * @param credentials 请求凭证信息
 * @param options 可选，请求配置
 * @returns RequestInit - 基本请求配置
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
 * 创建带 cookie 认证的请求
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
 * 创建带 Bearer token 认证的请求
 */
const createTokenAuthRequest = async (
  userId: number | string | undefined,
  accessToken: string,
  options: RequestInit = {},
): Promise<RequestInit> =>
  createBaseRequest(
    await createRequestHeaders(AUTH_MODE.TOKEN_AUTH_MODE, userId, accessToken),
    "omit",
    options,
  )

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
 * 基于 apiRequest 的快捷函数：直接提取 data
 * @waring 非必要请勿在外部使用
 * @see fetchApi fetchApiData
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
  responseType: TempWindowResponseType,
): Promise<ApiResponse<T> | T> => {
  const response = await fetch(url, options)

  if (!response.ok) {
    throw new ApiError(
      `请求失败: ${response.status}`,
      response.status,
      endpoint,
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
      authOptions = await createTokenAuthRequest(userId, token!)
      break
    case AuthTypeEnum.None:
      authOptions = {}
      break
    default:
      if (token) {
        authOptions = await createTokenAuthRequest(userId, token!)
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
 * 通用 API 请求函数，直接返回 data
 * @param params
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

export function fetchApi<T>(
  params: FetchApiParams,
  _normalResponseType: true,
): Promise<T>
export function fetchApi<T>(
  params: FetchApiParams,
  _normalResponseType?: false,
): Promise<ApiResponse<T>>

/**
 * 通用 API 请求函数
 * @param params
 * @param _normalResponseType
 */
export async function fetchApi<T>(
  params: FetchApiParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _normalResponseType?: boolean,
): Promise<T | ApiResponse<T>> {
  return await _fetchApi(params)
}

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

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch (error) {
    console.warn("Invalid URL for temp window fallback:", url, error)
    return false
  }
}

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
 * 从文本中提取金额及货币符号
 * @param {string} text - 输入文本
 * @param exchangeRate - （CNY per USD）
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
