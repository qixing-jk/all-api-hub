/**
 * API 服务 - 用于与 One API/New API 站点进行交互
 */
import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { PerCallPrice } from "~/services/models/utils/modelPricing"
import {
  ApiToken,
  AuthTypeEnum,
  CheckInConfig,
  SiteHealthStatus,
  TempWindowHealthStatusCode,
  type AccountIdentity,
  type Sub2ApiAuthConfig,
} from "~/types"

export {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  summarizeApiServiceFetchContext,
  summarizeApiTransportFetchContext,
  type ApiResponse,
  type ApiServiceFetchContext,
  type ApiServiceFetchContextKind,
  type ApiServiceRequest,
  type ApiTransportFetchContext,
  type ApiTransportFetchContextKind,
  type ApiTransportRequest,
  type AuthConfig,
  type FetchApiOptions,
  type OpenAIAuthParams,
  type UpstreamModelItem,
  type UpstreamModelList,
} from "~/services/apiTransport/type"

// ============= 类型定义 =============
export interface UserInfo {
  id: AccountIdentity
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
    userId?: AccountIdentity
    username?: string
    sub2apiAuth?: Sub2ApiAuthConfig
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
  theme?: string
  /**
   * 是否启用签到功能
   */
  checkin_enabled?: boolean
}

export interface SiteNoticeResponse {
  success: boolean
  data?: string | null
  message?: string
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

export type CreateTokenResult = boolean | ApiToken

// 模型定价信息类型
export interface ModelPricing {
  model_name: string
  model_description?: string
  quota_type: number // 0 = 按量计费，1 = 按次计费
  model_ratio: number
  model_price: number | PerCallPrice
  /**
   * Direct token prices in USD per 1M tokens for providers that do not expose
   * One-API/New-API ratio semantics.
   */
  token_price_usd_per_million?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
  }
  price_metadata?: ModelPriceMetadata
  owner_by?: string
  completion_ratio: number
  enable_groups: string[]
  supported_endpoint_types: string[]
}

export const MODEL_LIST_SOURCE_KINDS = {
  USER_SCOPED: "user-scoped",
  CATALOG_FALLBACK: "catalog-fallback",
  SUB2API_RUNTIME_KEY: "sub2api-runtime-key",
} as const

export type ModelListSourceKind =
  (typeof MODEL_LIST_SOURCE_KINDS)[keyof typeof MODEL_LIST_SOURCE_KINDS]

export const MODEL_PRICE_SOURCE_KINDS = {
  NONE: "none",
  OFFICIAL_RATE_ESTIMATE: "official-rate-estimate",
  CHANNEL_PRICING: "channel-pricing",
} as const

export type ModelPriceSourceKind =
  (typeof MODEL_PRICE_SOURCE_KINDS)[keyof typeof MODEL_PRICE_SOURCE_KINDS]

export const MODEL_PRICE_PRECISION_KINDS = {
  EXACT: "exact",
  ESTIMATED: "estimated",
  UNAVAILABLE: "unavailable",
} as const

export type ModelPricePrecisionKind =
  (typeof MODEL_PRICE_PRECISION_KINDS)[keyof typeof MODEL_PRICE_PRECISION_KINDS]

export const MODEL_UNAVAILABLE_PRICE_REASONS = {
  MODEL_LIST_ONLY: "model-list-only",
  KEY_GROUP_UNKNOWN: "key-group-unknown",
  OFFICIAL_PRICE_MISSING: "official-price-missing",
  PRICING_SOURCE_UNAVAILABLE: "pricing-source-unavailable",
} as const

export type ModelUnavailablePriceReason =
  (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS]

export interface ModelPriceMetadata {
  source: ModelPriceSourceKind
  precision: ModelPricePrecisionKind
  unavailable_reason?: ModelUnavailablePriceReason
  source_date?: string
  unmatched_model_count?: number
}

export interface ModelListSourceInfo {
  kind: ModelListSourceKind
  provider?: AccountSiteType
  supportsRuntimeModelList?: boolean
  supportsPricing?: boolean
}

/**
 * Returns whether a model row intentionally lacks usable pricing data.
 */
export function isModelPriceUnavailable(
  model: Pick<ModelPricing, "price_metadata">,
) {
  return (
    model.price_metadata?.precision === MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE
  )
}

// 模型定价响应类型
export interface PricingResponse {
  data: ModelPricing[]
  group_ratio: Record<string, number>
  success: boolean
  usable_group: Record<string, string>
  model_list_source?: ModelListSourceInfo
}

export interface PaginatedData<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}

// 分页令牌响应类型
export type PaginatedTokenResponse = PaginatedData<ApiToken>

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

export interface LogStatResponseData {
  quota?: number
  rpm?: number
  tpm?: number
}

export interface TodayLogQueryConfig {
  endpoint?: string
  pageParamName?: string
  pageSizeParamName?: string
  logTypeParamName?: string
  itemsField?: "items" | "data"
  totalField?: "total" | "total_count"
  includeGroupParam?: boolean
  extraParams?: Record<string, string>
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
