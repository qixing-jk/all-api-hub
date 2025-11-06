import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import type {
  ApiResponse,
  LogItem,
  TodayUsageData
} from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"
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
): RequestInit =>
  createBaseRequest(createRequestHeaders(userId), "include", options)

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
  options?: RequestInit,
  endpoint?: string
): Promise<T> => {
  const res = await apiRequest<T>(url, options, endpoint)

  if (res.success === false || res.data === undefined) {
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
 * @returns ApiResponse 对象
 * 默认：返回完整响应，不提取 data
 * @waring 非必要请勿在外部使用
 * @see fetchApi fetchApiData
 */
const apiRequest = async <T>(
  url: string,
  options?: RequestInit,
  endpoint?: string
): Promise<ApiResponse<T>> => {
  const response = await fetch(url, options)

  if (!response.ok) {
    throw new ApiError(
      `请求失败: ${response.status}`,
      response.status,
      endpoint
    )
  }

  return response.json()
}

// 通用请求函数
export interface FetchApiParams {
  baseUrl: string
  endpoint: string
  userId?: number | string
  token?: string
  authType?: AuthTypeEnum // 认证方式，默认 token
  options?: RequestInit // 可额外自定义 fetch 参数
}

const _fetchApi = async <T>(
  { baseUrl, endpoint, userId, token, authType, options }: FetchApiParams,
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

  try {
    if (onlyData) {
      return await apiRequestData<T>(url, fetchOptions, endpoint)
    }
    return await apiRequest<T>(url, fetchOptions, endpoint)
  } catch (error) {
    console.error(`请求 ${endpoint} 失败:`, error)
    throw error
  }
}

/**
 * 通用 API 请求函数，直接返回 data
 * @param params
 */
export const fetchApiData = async <T>(params: FetchApiParams): Promise<T> => {
  return (await _fetchApi(params, true)) as T
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
