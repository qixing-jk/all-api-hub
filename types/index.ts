// 账号信息数据类型定义

// 站点健康状态
import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"

export enum SiteHealthStatus {
  Healthy = "healthy",
  Warning = "warning",
  Error = "error",
  Unknown = "unknown"
}

// Log item from API
export interface LogItem {
  type: number
  quota: number
  created_time: number
  token_name?: string
  model_name?: string
}

export interface HealthStatus {
  status: SiteHealthStatus
  reason?: string
}

// 账号基础信息
export interface AccountInfo {
  id: number // 账号 ID（整数）
  access_token: string
  username: string
  quota: number // 总余额点数
  today_prompt_tokens: number // 今日 prompt_tokens
  today_completion_tokens: number // 今日 completion_tokens
  today_quota_consumption: number // 今日消耗 quota
  today_requests_count: number // 今日请求次数
  today_income: number // 今日收入 (recharge + check-in)
}

// 站点账号完整信息
export interface SiteAccount {
  id: string // 此项 id
  /**
   * emoji
   * @deprecated not used anymore
   */
  emoji?: string
  site_name: string // 站点名称
  site_url: string // 站点 url
  health: HealthStatus
  site_type: string // 站点类型
  exchange_rate: number // 人民币与美元充值比例 (CNY per USD)
  account_info: AccountInfo // 账号信息
  last_sync_time: number // 最后同步时间 (timestamp)
  updated_at: number // 更改时间 (timestamp)
  created_at: number // 创建时间 (timestamp)
  notes?: string // 备注
  /**
   * @deprecated Use `checkIn.isCheckedInToday` instead.
   */
  can_check_in?: boolean // 是否可以签到
  /**
   * @deprecated Use `checkIn` object presence instead.
   */
  supports_check_in?: boolean // 是否支持签到功能
  authType: AuthTypeEnum // 认证方式
  /**
   * 站点签到相关
   */
  checkIn: CheckInConfig
  /**
   * Configuration version for migration tracking
   * @since v1.0.0 - Initial version (no version field = version 0)
   * @since v1.1.0 - Introduced checkIn object structure
   */
  configVersion?: number
}

export interface CheckInConfig {
  /**
   * Whether to enable check-in detection and monitoring.
   * This is the master toggle that controls whether the system should:
   * - Detect check-in support during account setup
   * - Check today's check-in status during refresh operations
   * - Display check-in UI elements
   *
   * When false or undefined, check-in functionality is completely disabled for this account.
   */
  enableDetection: boolean

  /**
   * Whether to enable automatic daily check-in for this account.
   * Only effective when:
   * - enableDetection is true
   * - Global auto check-in feature is enabled
   * - Account has necessary credentials for check-in
   * Default: true for user configure and be considered true when it is undefined.
   */
  autoCheckInEnabled?: boolean

  /**
   * Today's check-in status.
   * - true: Already checked in today
   * - false: Can check in today (not yet checked in)
   * - undefined: Status unknown or detection not enabled
   *
   * This field is only meaningful when enableDetection is true.
   * It is updated during refresh operations if enableDetection is true.
   */
  isCheckedInToday?: boolean

  /**
   * Custom URL for check-in operations.
   * When provided, the system will navigate to this URL instead of the default check-in page.
   * This allows users to specify alternative check-in endpoints.
   */
  customCheckInUrl?: string

  /**
   * The date (YYYY-MM-DD format) when the user last checked in manually.
   * Used to reset the check-in status daily for custom check-in URLs.
   */
  lastCheckInDate?: string

  /**
   * Custom URL path for redeem/topup operations.
   */
  customRedeemUrl?: string

  /**
   * Whether to open the redeem page when opening a custom check-in URL.
   * Only applicable when customCheckInUrl is set.
   * When true, both the custom check-in URL and redeem page will be opened.
   * When false, only the custom check-in URL will be opened.
   * Default: true (for backward compatibility)
   */
  openRedeemWithCheckIn?: boolean
}

// 存储配置
export interface AccountStorageConfig {
  accounts: SiteAccount[]
  /**
   *  IDs of pinned accounts, in order (newest pinned first)
   */
  pinnedAccountIds: string[]
  last_updated: number
}

// 账号统计信息 (用于展示)
export interface AccountStats {
  total_quota: number
  today_total_consumption: number
  today_total_requests: number
  today_total_prompt_tokens: number
  today_total_completion_tokens: number
  today_total_income: number // 今日总收入 (所有账号汇总)
}

// API 响应相关类型
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message: string
}

// 用于排序的字段类型
export type SortField = "name" | BalanceType
export type SortOrder = "asc" | "desc"

// 货币类型
export type CurrencyType = "USD" | "CNY"

export type CurrencyAmount = { USD: number; CNY: number }

export type CurrencyAmountMap = { [id: string]: CurrencyAmount }

export type TokenUsage = { upload: number; download: number }

// 展示用的站点数据 (兼容当前 UI)
export interface DisplaySiteData {
  id: string
  /**
   * @deprecated not used anymore
   */
  icon?: string
  name: string
  username: string
  balance: CurrencyAmount
  todayConsumption: CurrencyAmount
  todayIncome: CurrencyAmount
  todayTokens: TokenUsage
  health: HealthStatus
  last_sync_time?: number
  siteType: string // 站点类型
  baseUrl: string // 站点 URL，用于复制功能
  token: string // 访问令牌，用于复制功能
  userId: number // 真实的用户 ID，用于 API 调用
  notes?: string
  /**
   * @deprecated Use `checkIn.isCheckedInToday` instead.
   */
  can_check_in?: boolean // 是否可以签到
  /**
   * @deprecated Use `checkIn` object presence instead.
   */
  supports_check_in?: boolean // 是否支持签到功能
  authType: AuthTypeEnum // 认证方式
  checkIn: CheckInConfig
}

// 站点的token 密钥信息(API 密钥)
export interface ApiToken {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  model_limits_enabled?: boolean
  model_limits?: string
  allow_ips?: string
  used_quota: number
  group?: string // 可选字段，某些站点可能没有
  DeletedAt?: null
  models?: string // 某些站点使用 models 而不是 model_limits
}

export type BalanceType =
  | typeof DATA_TYPE_CONSUMPTION
  | typeof DATA_TYPE_BALANCE

export enum AuthTypeEnum {
  AccessToken = "access_token",
  Cookie = "cookie",
  None = "none"
}

// Current version constant
export const CURRENT_CONFIG_VERSION = 1

// Service Response Types
export * from "./serviceResponse"
export type {
  ServiceResponse,
  AccountValidationResponse,
  AccountSaveResponse,
  AutoConfigToNewApiResponse
} from "./serviceResponse"

// New API Types
export * from "./newapi"

// Model Redirect Types
export * from "./modelRedirect"

// WebDAV Types
export * from "./webdav"
