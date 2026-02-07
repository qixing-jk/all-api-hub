/**
 * API 服务 - 用于与 One API/New API 站点进行交互
 */
import {
  ApiToken,
  AuthTypeEnum,
  CheckInConfig,
  SiteHealthStatus,
  TempWindowHealthStatusCode,
} from "~/types"
import type { PerCallPrice } from "~/utils/modelPricing"
import type { TempWindowResponseType } from "~/utils/tempWindowFetch"

// ============= 类型定义 =============
export interface UserInfo {
  id: number
  username: string
  access_token: string | null
}

export interface AccessTokenInfo {
  username: string
  access_token: string
}

export interface TodayUsageData {
  today_quota_consumption: number
  today_prompt_tokens: number
  today_completion_tokens: number
  today_requests_count: number
}

export interface TodayIncomeData {
  today_income: number
}

export type TodayStatsData = TodayUsageData & TodayIncomeData

export interface AccountData extends TodayStatsData {
  quota: number
  /**
   * Legacy flag indicating whether the account can be checked in today.
   * @deprecated Use `checkIn.siteStatus.isCheckedInToday` instead.
   */
  can_check_in?: boolean
  checkIn: CheckInConfig
}

export interface RefreshAccountResult {
  success: boolean
  data?: AccountData
  healthStatus: HealthCheckResult
  /**
   * Optional auth/identity updates discovered during refresh.
   *
   * This is used by site implementations that can re-sync credentials from a
   * browser context (e.g., Sub2API JWT stored in localStorage) without
   * re-authenticating the user.
   */
  authUpdate?: {
    accessToken?: string
    userId?: number
    username?: string
  }
}

export interface HealthCheckResult {
  status: SiteHealthStatus
  message: string
  /**
   * Optional machine-readable reason code for actionable UI.
   */
  code?: TempWindowHealthStatusCode
}

export interface SiteStatusInfo {
  price?: number
  stripe_unit_price?: number
  PaymentUSDRate?: number
  system_name?: string
  /**
   * 是否启用签到功能
   */
  checkin_enabled?: boolean
}

// 模型列表响应类型
export interface ModelsResponse {
  data: string[]
  message: string
  success: boolean
}

// 分组信息类型
export interface UserGroupInfo {
  desc: string
  ratio: number
}

// 分组响应类型
export interface UserGroupsResponse {
  data: Record<string, UserGroupInfo>
  message: string
  success: boolean
}

// 创建令牌请求类型
export interface CreateTokenRequest {
  name: string
  remain_quota: number
  expired_time: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  group: string
}

// 模型定价信息类型
export interface ModelPricing {
  model_name: string
  model_description?: string
  quota_type: number // 0 = 按量计费，1 = 按次计费
  model_ratio: number
  model_price: number | PerCallPrice
  owner_by?: string
  completion_ratio: number
  enable_groups: string[]
  supported_endpoint_types: string[]
}

// 模型定价响应类型
export interface PricingResponse {
  data: ModelPricing[]
  group_ratio: Record<string, number>
  success: boolean
  usable_group: Record<string, string>
}

export interface PaginatedData<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}

// 分页令牌响应类型
export type PaginatedTokenResponse = PaginatedData<ApiToken>

// API 响应的通用格式
export interface ApiResponse<T = any> {
  success: boolean
  data: T
  message: string
}

/**
 * 日志类型
 * @see https://github.com/QuantumNous/new-api/blob/8ef99f472875ceeaf20aecb2bb0f2b33ff575feb/model/log.go#L43
 */
export enum LogType {
  /** 所有 */
  All = 0,
  /** 充值 */
  Topup = 1,
  /** 消费 */
  Consume = 2,
  /** 管理 */
  Manage = 3,
  /** 系统 */
  System = 4,
  /** 错误 */
  Error = 5,
  /** Refund */
  Refund = 6,
}

/**
 * 日志条目
 * @see https://github.com/QuantumNous/new-api/blob/aa35d8db69b50d6401550bd34b6f37ef5863acd0/model/log.go#L20
 */
export interface LogItem {
  id: number
  user_id: number
  created_at: number
  /**
   * 日志类型
   * @see LogType
   */
  type: LogType
  /**
   * 系统消息内容，说明文字
   * @example
   * 签到奖励 ＄10.586246 额度
   * 通过兑换码充值 ＄0.200000 额度，兑换码ID 1
   */
  content: string
  username: string
  token_name: string
  model_name: string
  /**
   * 额度变动
   */
  quota: number
  prompt_tokens: number
  completion_tokens: number
  use_time: number
  is_stream: boolean
  channel_id: number
  channel_name: string
  token_id: number
  group: string
  ip: string
  other: string // JSON 字符串，可以进一步解析为对象
}

// 日志响应数据
export interface LogResponseData {
  items: LogItem[]
  total: number
}

export interface Payment {
  id: number
  type: string
  uuid: string
  name: string
  icon: string
  notify_domain: string
  fixed_fee: number
  min_amount: number
  max_amount: number
  percent_fee: number
  currency: string
  currency_discount: number
  config: string
  sort: number
  enable: boolean | null
  enable_invoice: boolean
  created_at: number
}

export interface PaymentResponse {
  background: string
  banner: string
  message: string
  payments: Payment[]
  success: boolean
}

/**
 * 基础请求参数（无需认证）
 */
export interface BaseFetchParams {
  baseUrl: string
  userId: number | string
}

/**
 * 带认证信息的请求参数（使用 token 验证）
 */
export interface AuthFetchParams extends BaseFetchParams {
  token: string
}

/**
 * 带认证类型的请求参数
 */
export interface AuthTypeFetchParams extends AuthFetchParams {
  authType?: AuthTypeEnum
}

/**
 * Unified authentication config for ApiServiceRequest.
 */
export interface AuthConfig {
  /** 认证类型: cookie | access_token | none */
  authType: AuthTypeEnum
  /**
   * Cookie 字符串
   * 因为浏览器无法通过其他方式自定义请求携带的cookie,只能DNR
   * 但DNR部分已经注入cookie头,所以这里传入的cookie是备用方案，主要避免后续还需从存储中读取cookie
   */
  cookie?: string
  /** 访问令牌（用于 token/access_token 认证） */
  accessToken?: string
  /** 用户 ID（用于 cookie 认证或通用标识） */
  userId?: number | string
}

/**
 * API 服务请求的统一参数对象。
 *
 * 用于在 apiService 层统一承载认证信息、站点 baseUrl，以及可扩展的业务数据。
 * 后续可以在 `auth.cookie` / `accountId` 上扩展为 cookie 认证的多账号管理。
 */
export interface ApiServiceRequest {
  /**
   * 认证信息
   */
  auth: AuthConfig
  /**
   * API 基础 URL
   */
  baseUrl: string
  /**
   * 传入的具体业务数据对象（可选，用于逐步迁移调用方参数）
   */
  data?: Record<string, any>
  /**
   * 账号 ID（用于后续查询账号信息，目前可选）
   */
  accountId?: string
}

/**
 * Account-data related requests must include check-in config.
 *
 * Note: we keep `ApiServiceRequest` as the minimal/common request DTO, and only
 * extend it for flows that actually need extra fields (like check-in).
 */
export type ApiServiceAccountRequest = ApiServiceRequest & {
  checkIn: CheckInConfig
  /**
   * Whether account refresh should include fetching "today cashflow" statistics
   * (today consumption/income plus token/request counts).
   *
   * When false, API services MUST skip the log pagination requests used solely
   * for today stats and return zeroed today fields instead.
   *
   * Default: true (when undefined).
   */
  includeTodayCashflow?: boolean
}

/**
 * fetchApi / fetchApiData 的请求配置（除 auth/baseUrl 外）。
 *
 * 该类型从历史 `FetchApiParams` 结构中抽取出来，便于在统一 DTO 路径下复用。
 */
export interface FetchApiOptions {
  endpoint: string
  options?: RequestInit
  responseType?: TempWindowResponseType
}

/**
 * OpenAI 模型请求认证参数
 */
export interface OpenAIAuthParams {
  // API 基础地址
  baseUrl: string
  /** API Key */
  apiKey: string
}

// 上游模型列表（OpenAI格式）
export type UpstreamModelItem = {
  id: string
  object: "model"
  created: number
  owned_by: string
}

export type UpstreamModelList = UpstreamModelItem[]

// 兑换码相关类型
export interface RedeemCodeRequest {
  key: string
}

export interface RedeemCodeResponse {
  success: boolean
  message: string
  /**
   * 兑换获得的额度
   */
  data: number
}

export interface CheckinRecord {
  /**
   * 签到日期，格式 YYYY-MM-DD
   * @example "2026-01-03"
   */
  checkin_date: string
  quota_awarded: number
}

export interface CheckInStatus {
  /**
   * 是否启用签到功能
   */
  enabled: boolean
  max_quota: number
  min_quota: number
  stats: {
    /**
     * 今天是否已签到
     * @example true 今日已经签到
     * @example false 今日尚未签到
     */
    checked_in_today: boolean
    checkin_count: number
    records: CheckinRecord[]
    total_checkins: number
    total_quota: number
  }
}

export interface CheckInStatusResponse {
  data: CheckInStatus
  success: boolean
}

/**
 * New-API 签到响应类型
 */
export type NewApiCheckinResponse = {
  data: CheckinRecord
  success: boolean
  /**
   * Response message from the API.
   * @example "签到成功"
   * @example "今日已签到"
   * @example "签到失败，请稍后重试"
   * @example "签到失败：更新额度出错"
   */
  message: string
}
