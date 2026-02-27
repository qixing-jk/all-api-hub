import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CASHFLOW,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_INCOME,
} from "~/constants"
import { TempWindowHealthStatusCode } from "~/types/tempWindow"
import type { TurnstilePreTrigger } from "~/types/turnstile"

export enum SiteHealthStatus {
  Healthy = "healthy",
  Warning = "warning",
  Error = "error",
  Unknown = "unknown",
}

export interface HealthStatus {
  status: SiteHealthStatus
  reason?: string
  /**
   * Optional machine-readable reason code for the current health state.
   * Used by the UI to provide actionable shortcuts (e.g., jump to settings).
   */
  code?: HealthStatusCode
}

/**
 * Subset of health status codes that the UI can act on (e.g., open Settings).
 */
export type HealthStatusCode = TempWindowHealthStatusCode

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

export interface CookieAuthConfig {
  /**
   * Cookie header string used for cookie-auth multi-account requests.
   * The extension will merge these with WAF cookies at request time.
   */
  sessionCookie: string
}

export interface Sub2ApiAuthConfig {
  /**
   * Exportable refresh token used for extension-managed Sub2API sessions.
   *
   * Security: this is a long-lived secret and will be included in
   * exports/WebDAV backups.
   */
  refreshToken: string
  /**
   * Access-token expiry timestamp in milliseconds since epoch (optional).
   * Used for proactive refresh to avoid unnecessary 401 spikes.
   */
  tokenExpiresAt?: number
}

// 站点账号完整信息
export interface SiteAccount {
  id: string // 此项 id
  /**
   * Emoji icon previously used for the account label in legacy UIs.
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
   * Global tag ids associated with this account.
   *
   * Tag ids reference {@link Tag.id} entries stored in the global tag store.
   * This enables global rename/delete operations without touching every account.
   */
  tagIds: string[]
  /**
   * Legacy tag names stored on the account record.
   * @deprecated Replaced by {@link SiteAccount.tagIds}. Kept only for backward
   * compatibility and migration of old backups/storage.
   */
  tags?: string[] // 标签（旧格式：按名称存储）
  /**
   * Whether this stored account is disabled in the extension.
   *
   * Disabled accounts:
   * - Must not participate in background/automated services (refresh, auto check-in, redeem assist, etc.)
   * - Must be excluded from aggregate stats computations
   * - Must have all account actions blocked except re-enabling
   *
   * Backward compatible: missing/undefined is treated as enabled (false).
   */
  disabled?: boolean
  /**
   * Whether this stored account is excluded from the "Total Balance" aggregate.
   *
   * Unlike {@link SiteAccount.disabled}, excluded accounts remain enabled for refresh,
   * check-in, and other background behaviors; they are only skipped when computing
   * the Total Balance display value.
   *
   * Backward compatible: missing/undefined is treated as included (false).
   */
  excludeFromTotalBalance?: boolean
  /**
   * Legacy flag indicating whether the account can be checked in today.
   * @deprecated Use `checkIn.siteStatus.isCheckedInToday` instead.
   */
  can_check_in?: boolean // 是否可以签到
  /**
   * Legacy flag indicating whether the account supports check-in at all.
   * @deprecated Use `checkIn` object presence instead.
   */
  supports_check_in?: boolean // 是否支持签到功能
  authType: AuthTypeEnum // 认证方式
  /**
   * Per-account cookie-auth session cookie bundle for multi-account isolation.
   */
  cookieAuth?: CookieAuthConfig
  /**
   * Optional Sub2API refresh-token configuration for extension-managed sessions.
   *
   * When configured, the extension can refresh and rotate Sub2API tokens per
   * account, enabling multiple accounts on the same origin without relying on
   * dashboard localStorage.
   */
  sub2apiAuth?: Sub2ApiAuthConfig
  /**
   * 站点签到相关
   */
  checkIn: CheckInConfig
  /**
   * Manual balance override in USD, as entered by the user.
   *
   * Empty/undefined means the account should rely on auto-fetched quota/balance.
   */
  manualBalanceUsd?: string
  /**
   * Configuration version for migration tracking
   * 1.0.0: Initial version (no version field = version 0)
   * 1.1.0: Introduced `checkIn` object structure (configVersion = 1)
   * 1.1.1: Split site vs custom check-in state (configVersion = 2)
   * 1.2.0: Persist/normalize `disabled` flag (configVersion = 3)
   * 1.2.1: Persist/normalize `excludeFromTotalBalance` flag (configVersion = 4)
   * 1.2.2: Persist/normalize Sub2API refresh-token auth (configVersion = 5)
   * @since 1.0.0
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
   * Status for the built-in site check-in flow (API-backed detection).
   * This status is independent from the custom check-in URL flow.
   */
  siteStatus?: {
    /**
     * Today's check-in status.
     * - true: Already checked in today
     * - false: Can check in today (not yet checked in)
     * - undefined: Status unknown or detection not enabled
     */
    isCheckedInToday?: boolean

    /**
     * The date (YYYY-MM-DD format) when the site check-in was last marked as done.
     * Used by the auto check-in scheduler to reset the daily state.
     */
    lastCheckInDate?: string

    /**
     * Timestamp (ms) of the last successful check-in status detection for this account.
     *
     * This is used by the UI to warn users when the displayed check-in status may be stale
     * (e.g., status was detected on a previous day, so "checked in" / "not checked in"
     * might not represent today's real state).
     */
    lastDetectedAt?: number
  }

  /**
   * Configuration and status for the custom check-in URL flow.
   * This does not disable the site check-in feature and can co-exist with it.
   */
  customCheckIn?: {
    /**
     * Custom URL for check-in operations.
     * When provided, the UI can open this URL in addition to the site check-in page.
     */
    url?: string

    /**
     * Optional Turnstile widget pre-trigger configuration used by temp-window
     * Turnstile-assisted fetch flows.
     *
     * Advanced: this is typically only needed for deployments that render
     * Turnstile only after a user action (e.g. a check-in button click).
     */
    turnstilePreTrigger?: TurnstilePreTrigger

    /**
     * Custom URL path for redeem/topup operations.
     */
    redeemUrl?: string

    /**
     * Whether to open the redeem page when opening a custom check-in URL.
     * Only applicable when `customCheckIn.url` is set.
     * Default: true (for backward compatibility)
     */
    openRedeemWithCheckIn?: boolean

    /**
     * Today's custom check-in status.
     * - true: Already opened/checked in today
     * - false: Not yet opened/checked in today
     */
    isCheckedInToday?: boolean

    /**
     * The date (YYYY-MM-DD format) when the user last checked in via the custom URL.
     * Used to reset the custom check-in status daily.
     */
    lastCheckInDate?: string
  }
}

/**
 * Lightweight persisted bookmark entry for quickly opening a site URL.
 *
 * Bookmarks are stored in {@link AccountStorageConfig.bookmarks} and share the
 * global tag system via {@link SiteBookmark.tagIds}.
 */
export interface SiteBookmark {
  id: string
  name: string
  url: string
  /**
   * Global tag ids associated with this bookmark.
   */
  tagIds: string[]
  /**
   * Free-form notes for this bookmark.
   *
   * Always persisted as a string; default: "".
   */
  notes: string
  created_at: number
  updated_at: number
}

// 存储配置
export interface AccountStorageConfig {
  accounts: SiteAccount[]
  /**
   * Persisted bookmarks stored alongside accounts.
   *
   * Always persisted as an array; default: [].
   */
  bookmarks: SiteBookmark[]
  /**
   * IDs of pinned entries (accounts and/or bookmarks), in order (newest pinned first).
   */
  pinnedAccountIds: string[]
  /**
   * Manual ordering of entries (full list of ids), newest change first.
   */
  orderedAccountIds?: string[]
  last_updated: number
}

/**
 * A globally managed tag entity with a stable id.
 *
 * Tags are stored in a dedicated global tag store and referenced by accounts
 * via {@link SiteAccount.tagIds}.
 */
export interface Tag {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

/**
 * Persisted global tag store payload.
 */
export interface TagStore {
  version: number
  tagsById: Record<string, Tag>
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
export type SortField =
  | "name"
  | typeof DATA_TYPE_CONSUMPTION
  | typeof DATA_TYPE_INCOME
  | typeof DATA_TYPE_BALANCE
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
   * Icon URL or identifier used by older UI components for site branding.
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
   * Tag ids associated with this account (stable identifiers).
   *
   * UI logic should prefer filtering by ids to stay consistent across renames.
   */
  tagIds?: string[]
  /**
   * Display tag labels resolved from {@link DisplaySiteData.tagIds}.
   *
   * This is a UI convenience field; persistence uses tag ids.
   */
  tags?: string[]
  /**
   * Disabled state projected from {@link SiteAccount.disabled}.
   *
   * UI can use this flag to grey-out accounts and restrict actions without
   * re-querying storage.
   */
  disabled?: boolean
  /**
   * "Exclude from Total Balance" state projected from {@link SiteAccount.excludeFromTotalBalance}.
   *
   * This affects only the Total Balance aggregate; it must not be interpreted as
   * a disabled state for actions like refresh or check-in.
   */
  excludeFromTotalBalance?: boolean
  /**
   * Legacy flag indicating whether the account can be checked in today.
   * @deprecated Use `checkIn.siteStatus.isCheckedInToday` instead.
   */
  can_check_in?: boolean // 是否可以签到
  /**
   * Legacy flag indicating whether the account supports check-in at all.
   * @deprecated Use `checkIn` object presence instead.
   */
  supports_check_in?: boolean // 是否支持签到功能
  authType: AuthTypeEnum // 认证方式
  /**
   * Account id for per-request cookie isolation.
   */
  accountId?: string
  /**
   * Per-account cookie-auth session cookie header to merge with WAF cookies.
   */
  cookieAuthSessionCookie?: string
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

export type DashboardTabType =
  | typeof DATA_TYPE_CASHFLOW
  | typeof DATA_TYPE_BALANCE

export enum AuthTypeEnum {
  AccessToken = "access_token",
  Cookie = "cookie",
  None = "none",
}
export type { TempWindowHealthStatusCode } from "~/types/tempWindow"
export { TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types/tempWindow"
