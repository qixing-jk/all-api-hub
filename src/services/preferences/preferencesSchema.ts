import { type ManagedSiteType } from "~/constants/siteType"
import { type TempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import {
  type ActiveSortField,
  type CurrencyType,
  type DashboardTabType,
  type SortOrder,
} from "~/types"
import { type AccountAutoRefresh } from "~/types/accountAutoRefresh"
import { type AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"
import { type AutoCheckinPreferences } from "~/types/autoCheckin"
import { type AxonHubConfig } from "~/types/axonHubConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { type ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { type ClaudeCodeRouterConfig } from "~/types/claudeCodeRouterConfig"
import { type CliProxyApiConfig } from "~/types/cliProxyApiConfig"
import { type BalanceHistoryPreferences } from "~/types/dailyBalanceHistory"
import { type DoneHubConfig } from "~/types/doneHubConfig"
import { type GptLoadConfig } from "~/types/gptLoadConfig"
import type { LegacyCliProxyApiConfig } from "~/types/legacyCliProxyApiConfig"
import { type LoggingPreferences } from "~/types/logging"
import { type ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import { type NewApiConfig } from "~/types/newApiConfig"
import { type OctopusConfig } from "~/types/octopusConfig"
import { type OmniRouteConfig } from "~/types/omnirouteConfig"
import { type SiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import type { SortingPriorityConfig } from "~/types/sorting"
import { type Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"
import { type TaskNotificationPreferences } from "~/types/taskNotifications"
import { type AppearancePreferences, type ThemeMode } from "~/types/theme"
import { type UsageHistoryPreferences } from "~/types/usageHistory"
import { type VeloeraConfig } from "~/types/veloeraConfig"
import { type WebDAVSettings, type WebDAVSyncStrategy } from "~/types/webdav"

export interface TempWindowFallbackReminderPreferences {
  dismissed: boolean
}

export const TOOLBAR_ACTION_CLICK_BEHAVIORS = {
  Popup: "popup",
  SidePanel: "sidepanel",
  Options: "options",
} as const

export type ToolbarActionClickBehavior =
  (typeof TOOLBAR_ACTION_CLICK_BEHAVIORS)[keyof typeof TOOLBAR_ACTION_CLICK_BEHAVIORS]

export interface RedemptionAssistUrlWhitelistPreferences {
  /**
   * When enabled, redemption assist will only run on URLs matching the whitelist.
   */
  enabled: boolean
  /**
   * User-provided whitelist patterns, one RegExp pattern per entry.
   * Patterns are evaluated using JavaScript RegExp syntax.
   */
  patterns: string[]
  /**
   * Include all pages under each account's site URL origin.
   */
  includeAccountSiteUrls: boolean
  /**
   * Include each account's resolved check-in and redeem URLs (custom or default).
   */
  includeCheckInAndRedeemUrls: boolean
}

export interface ContextMenuVisibilityPreferences {
  enabled: boolean
}

export interface RedemptionAssistPreferences {
  enabled: boolean
  contextMenu: ContextMenuVisibilityPreferences
  /**
   * When enabled, treat any 32-character non-whitespace token as a possible
   * redemption code (do not require strict hex charset).
   */
  relaxedCodeValidation: boolean
  urlWhitelist: RedemptionAssistUrlWhitelistPreferences
}

export interface WebAiApiCheckUrlWhitelistPreferences {
  /**
   * User-provided whitelist patterns, one RegExp pattern per entry.
   *
   * Patterns are evaluated using JavaScript RegExp syntax and treated as
   * case-insensitive in the current implementation.
   */
  patterns: string[]
}

export interface WebAiApiCheckKeyCleanupPreferences {
  /**
   * User-provided removal patterns, one RegExp pattern per entry.
   *
   * Matching text is removed from API key candidates before key-shape
   * classification. Patterns are evaluated using JavaScript RegExp syntax.
   */
  removalPatterns: string[]
}

export interface WebAiApiCheckEnhancedAutoDetectPreferences {
  /**
   * When enabled, automatic detection may prompt for enhanced extraction
   * matches such as bare domains, non-standard key formats, or cleaned keys.
   */
  enabled: boolean
}

export interface WebAiApiCheckAutoDetectPreferences {
  /**
   * When enabled, the content script may attempt to detect API credentials
   * from user actions (e.g., copy) on whitelisted pages.
   */
  enabled: boolean
  enhanced: WebAiApiCheckEnhancedAutoDetectPreferences
  urlWhitelist: WebAiApiCheckUrlWhitelistPreferences
}

export interface WebAiApiCheckPreferences {
  /**
   * Master enable switch for Web AI API Check.
   *
   * Manual triggers can still be shown when enabled regardless of auto-detect.
   */
  enabled: boolean
  contextMenu: ContextMenuVisibilityPreferences
  autoDetect: WebAiApiCheckAutoDetectPreferences
  keyCleanup: WebAiApiCheckKeyCleanupPreferences
}

// 用户偏好设置类型定义
export interface UserPreferences {
  appearance?: AppearancePreferences
  themeMode: ThemeMode
  /**
   * Controls what happens when the toolbar icon is clicked.
   * - popup: open extension popup (default)
   * - sidepanel: open side panel (if supported)
   * - options: open the standard options page
   */
  actionClickBehavior?: ToolbarActionClickBehavior
  /**
   * language preference
   */
  language?: string

  /**
   * Controls whether the extension automatically opens the docs changelog page
   * in a new active tab after an extension update.
   *
   * Optional for backward compatibility with stored preferences created before
   * this flag existed. Missing values MUST be treated as enabled via defaults.
   */
  openChangelogOnUpdate?: boolean

  /**
   * Controls whether the extension automatically provisions API keys after
   * successfully adding an account, using autoProvisionKeyOnAccountAddMode.
   *
   * Optional for backward compatibility with stored preferences created before
   * this flag existed. Missing values are treated as disabled via defaults.
   */
  autoProvisionKeyOnAccountAdd?: boolean

  /** Creation scope after account add; legacy and invalid values normalize to Default. */
  autoProvisionKeyOnAccountAddMode: AccountKeyAutoProvisionMode

  /**
   * Controls whether the add-account dialog automatically prefills the site URL
   * field from the current browser tab's origin.
   *
   * Optional for backward compatibility with stored preferences created before
   * this flag existed. Missing values MUST be treated as enabled via defaults.
   */
  autoFillCurrentSiteUrlOnAccountAdd?: boolean

  /**
   * Controls whether All API Hub shows a confirmation modal when adding an
   * account whose site URL already exists in storage (possible duplicate).
   *
   * Optional for backward compatibility with stored preferences created before
   * this flag existed. Missing values MUST be treated as enabled via defaults.
   */
  warnOnDuplicateAccountAdd?: boolean

  /**
   * Console logging configuration shared across all extension contexts.
   *
   * When `consoleEnabled` is disabled, no logs are emitted at any level
   * (including `error`).
   */
  logging: LoggingPreferences

  // BalanceSection 相关配置
  /**
   * 金额标签页状态
   */
  activeTab: DashboardTabType
  /**
   * 金额单位
   */
  currencyType: CurrencyType

  /**
   * Whether to show and fetch "today cashflow" statistics (today consumption/income
   * plus today token/request counts).
   *
   * When disabled, the UI hides today statistics and refresh flows skip the
   * log-based network requests used to compute them.
   *
   * Optional for backward compatibility with stored preferences created before
   * this flag existed. Missing values MUST be treated as enabled via defaults
   * and migration.
   */
  showTodayCashflow?: boolean

  // AccountList 相关配置
  /**
   * 用户自定义排序字段
   */
  sortField: ActiveSortField
  /**
   * 用户自定义排序顺序
   */
  sortOrder: SortOrder

  // 自动刷新相关配置
  accountAutoRefresh: AccountAutoRefresh

  // Usage history sync + analytics
  usageHistory?: UsageHistoryPreferences

  /**
   * Balance history (daily snapshot) capture + retention preferences.
   *
   * Optional for backward compatibility with stored preferences created before
   * this capability existed. Missing values use the shared balance-history
   * defaults and migration, enabling refresh-driven capture.
   */
  balanceHistory?: BalanceHistoryPreferences

  // 是否显示健康状态
  showHealthStatus: boolean

  // WebDAV 备份/同步配置
  webdav: WebDAVSettings

  // New API 相关配置
  newApi: NewApiConfig

  // Done Hub 相关配置
  doneHub?: DoneHubConfig

  // Veloera 相关配置
  veloera: VeloeraConfig

  // Octopus 相关配置
  octopus?: OctopusConfig

  // AxonHub 相关配置
  axonHub?: AxonHubConfig

  // Claude Code Hub 相关配置
  claudeCodeHub?: ClaudeCodeHubConfig

  // Sub2API 管理站点配置（Base URL + Admin API Key）
  sub2apiManagedSite?: Sub2ApiManagedSiteConfig

  // OmniRoute 管理站点配置（Base URL + 作用域访问令牌）
  omniroute?: OmniRouteConfig

  // gpt-load 管理站点配置（Base URL + 管理密钥）
  gptLoad?: GptLoadConfig

  // 管理站点类型 (用户可以选择管理 New API / Done Hub / Veloera / Octopus / AxonHub / Claude Code Hub)
  managedSiteType: ManagedSiteType

  // Released integration configuration: read only by the migration.
  cliProxy?: LegacyCliProxyApiConfig
  cliProxyApi?: CliProxyApiConfig

  // Claude Code Router 配置
  claudeCodeRouter?: ClaudeCodeRouterConfig

  // New API Model Sync 配置
  managedSiteModelSync?: {
    enabled: boolean
    // 同步间隔（毫秒）
    interval: number
    // 并发数量（单通道并发任务数）
    concurrency: number
    // 最大重试次数
    maxRetries: number
    // 单个渠道最大处理时长（秒），0 表示不限制
    channelProcessingTimeout: number
    rateLimit: {
      // 每分钟请求次数限制
      requestsPerMinute: number
      // 瞬时突发请求数
      burst: number
    }
    /**
     * 限制可同步的模型列表，空数组表示同步全部
     */
    allowedModels: string[]
    globalChannelModelFilters: ChannelModelFilterRule[]
  }

  /**
   * 自定义排序
   */
  sortingPriorityConfig?: SortingPriorityConfig

  // Auto Check-in 配置
  autoCheckin: AutoCheckinPreferences

  // Model Redirect 配置
  modelRedirect: ModelRedirectPreferences

  // Redemption Assist 配置
  redemptionAssist?: RedemptionAssistPreferences

  // Web AI API Check 配置
  webAiApiCheck?: WebAiApiCheckPreferences

  /**
   * 临时窗口过盾相关设置
   */
  tempWindowFallback?: TempWindowFallbackPreferences

  /**
   * Reminders related to temp-window fallback configuration.
   * When dismissed, the UI will stop showing opt-in reminder dialogs.
   */
  tempWindowFallbackReminder?: TempWindowFallbackReminderPreferences

  /**
   * Controls best-effort notifications emitted by background scheduled jobs.
   * Browser notification permission is still requested separately for the
   * browser channel.
   */
  taskNotifications?: TaskNotificationPreferences

  /**
   * Controls background polling and system notifications for provider-site
   * announcements. Records are still stored when browser notification
   * permission is missing.
   */
  siteAnnouncementNotifications?: SiteAnnouncementPreferences

  /**
   * 最后更新时间
   */
  lastUpdated: number
  /**
   * Last time a WebDAV-syncable/shared preference changed.
   *
   * Legacy stored preferences may omit this field; callers MUST fall back to
   * `lastUpdated` in that case.
   */
  sharedPreferencesLastUpdated?: number
  /**
   * Configuration version for migration tracking
   */
  preferencesVersion?: number

  /**
   * 以下字段已废弃，仅保留供迁移使用
   * Legacy base URL field preserved for migration from older configurations.
   * @deprecated Use newApi object instead
   */
  newApiModelSync?: {
    enabled: boolean
    interval: number
    concurrency: number
    maxRetries: number
    channelProcessingTimeout?: number
    rateLimit: {
      requestsPerMinute: number
      burst: number
    }
    allowedModels: string[]
    globalChannelModelFilters: ChannelModelFilterRule[]
  }
  newApiBaseUrl?: string
  /**
   * Legacy admin token field used before the nested newApi config existed.
   * @deprecated Use newApi object instead
   */
  newApiAdminToken?: string
  /**
   * Legacy user id field kept for backward compatibility during migration.
   * @deprecated Use newApi object instead
   */
  newApiUserId?: string
  /**
   * Legacy toggle for enabling automatic account refresh behavior.
   * @deprecated Use accountAutoRefresh instead
   */
  autoRefresh?: boolean
  /**
   * Legacy refresh cadence in seconds for auto refresh.
   * @deprecated Use accountAutoRefresh.interval instead
   */
  refreshInterval?: number
  /**
   * Legacy minimum interval in seconds between consecutive refresh runs.
   * @deprecated Use accountAutoRefresh.minInterval instead
   */
  minRefreshInterval?: number
  /**
   * Legacy flag controlling whether to trigger a refresh when the UI opens.
   * @deprecated Use accountAutoRefresh.refreshOnOpen instead
   */
  refreshOnOpen?: boolean
  /**
   * 远程备份文件完整URL（例如：https://dav.example.com/backups/all-api-hub.json）
   * Legacy inlined WebDAV URL field used before the nested webdav config existed.
   * @deprecated 请使用 webdav.url
   */
  webdavUrl?: string
  /**
   * WebDAV用户名
   * @deprecated 请使用 webdav.username
   */
  webdavUsername?: string
  /**
   * Legacy inlined WebDAV password field used before nested webdav config.
   * @deprecated 请使用 webdav.password
   */
  webdavPassword?: string // 密码
  /**
   * 是否启用自动同步
   * @deprecated 请使用 webdav.autoSync
   */
  webdavAutoSync?: boolean //
  /**
   * 自动同步间隔（秒）
   * @deprecated 请使用 webdav.syncInterval
   */
  webdavSyncInterval?: number //
  /**
   *  同步策略
   * @deprecated 请使用 webdav.syncStrategy
   */
  webdavSyncStrategy?: WebDAVSyncStrategy
}
