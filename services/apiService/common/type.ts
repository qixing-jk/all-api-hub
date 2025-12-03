/**
 * API 服务 - 用于与 One API/New API 站点进行交互
 */
import {
  ApiToken,
  AuthTypeEnum,
  CheckInConfig,
  SiteHealthStatus,
} from "~/types"
import type { PerCallPrice } from "~/utils/modelPricing"

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
   * @deprecated Use `checkIn.isCheckedInToday` instead.
   */
  can_check_in?: boolean
  checkIn: CheckInConfig
}

export interface RefreshAccountResult {
  success: boolean
  data?: AccountData
  healthStatus: HealthCheckResult
}

export interface HealthCheckResult {
  status: SiteHealthStatus
  message: string
}

export interface SiteStatusInfo {
  price?: number
  stripe_unit_price?: number
  PaymentUSDRate?: number
  system_name?: string
  check_in_enabled?: boolean
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
 * 日志类型。
 * - `0` 所有
 * - `1` 充值
 * - `2` 消费
 * - `3` 管理
 * - `4` 错误
 * - `5` 系统
 */
export enum LogType {
  /** 所有 */ All = 0,
  /** 充值 */ Recharge = 1,
  /** 消费 */ Consume = 2,
  /** 管理 */ Admin = 3,
  /** 错误 */ Error = 4,
  /** 系统 */ System = 5,
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
   * 日志类型，可选值：1=充值，2=消费，3=管理，4=错误，5=系统
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
