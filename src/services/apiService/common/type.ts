/**
 * API 服务 - 用于与 One API/New API 站点进行交互
 */
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  AuthTypeEnum,
  CheckInConfig,
  SiteHealthStatus,
  TempWindowHealthStatusCode,
  type AccountIdentity,
  type Sub2ApiAuthConfig,
} from "~/types"

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
   * Account-owned exchange rate (CNY per USD) used when parsing recharge/system
   * log text into quota units.
   *
   * The API service layer consumes this value but does not resolve it from
   * account storage.
   */
  exchangeRate?: number
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
