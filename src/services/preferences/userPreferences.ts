import { Storage } from "@plasmohq/storage"

import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import {
  STORAGE_LOCKS,
  USER_PREFERENCES_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
  DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
} from "~/services/preferences/contentScriptFeatureDefaults"
import {
  CURRENT_PREFERENCES_VERSION,
  migratePreferences,
} from "~/services/preferences/migrations/preferencesMigration"
import {
  createDefaultSortingPriorityConfig,
  DEFAULT_SORTING_PRIORITY_CONFIG,
} from "~/services/preferences/utils/sortingPriority"
import {
  getSharedPreferencesLastUpdated,
  normalizeSharedPreferencesMetadata,
  patchTouchesSharedPreferences,
  restoreWebdavLocalOnlyPreferences,
} from "~/services/preferences/webdavSharedPreferences"
import {
  ActiveSortField,
  CurrencyType,
  DashboardTabType,
  SortOrder,
} from "~/types"
import {
  AccountAutoRefresh,
  DEFAULT_ACCOUNT_AUTO_REFRESH,
} from "~/types/accountAutoRefresh"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  AutoCheckinPreferences,
} from "~/types/autoCheckin"
import {
  DEFAULT_AXON_HUB_CONFIG,
  type AxonHubConfig,
} from "~/types/axonHubConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import {
  DEFAULT_CLAUDE_CODE_HUB_CONFIG,
  type ClaudeCodeHubConfig,
} from "~/types/claudeCodeHubConfig"
import {
  DEFAULT_CLAUDE_CODE_ROUTER_CONFIG,
  type ClaudeCodeRouterConfig,
} from "~/types/claudeCodeRouterConfig"
import {
  DEFAULT_CLI_PROXY_CONFIG,
  type CliProxyConfig,
} from "~/types/cliProxyConfig"
import {
  DEFAULT_BALANCE_HISTORY_PREFERENCES,
  type BalanceHistoryPreferences,
} from "~/types/dailyBalanceHistory"
import {
  DEFAULT_DONE_HUB_CONFIG,
  type DoneHubConfig,
} from "~/types/doneHubConfig"
import {
  getDefaultLoggingPreferences,
  type LoggingPreferences,
} from "~/types/logging"
import {
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
  type ModelRedirectPreferences,
} from "~/types/managedSiteModelRedirect"
import { DEFAULT_NEW_API_CONFIG, NewApiConfig } from "~/types/newApiConfig"
import { DEFAULT_OCTOPUS_CONFIG, OctopusConfig } from "~/types/octopusConfig"
import {
  DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
  type SiteAnnouncementPreferences,
} from "~/types/siteAnnouncements"
import type { SortingPriorityConfig } from "~/types/sorting"
import {
  DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  type TaskNotificationPreferences,
} from "~/types/taskNotifications"
import type { ThemeMode } from "~/types/theme"
import {
  DEFAULT_USAGE_HISTORY_PREFERENCES,
  type UsageHistoryPreferences,
} from "~/types/usageHistory"
import { DeepPartial } from "~/types/utils"
import { DEFAULT_VELOERA_CONFIG, VeloeraConfig } from "~/types/veloeraConfig"
import {
  DEFAULT_WEBDAV_SETTINGS,
  WebDAVSettings,
  WebDAVSyncStrategy,
} from "~/types/webdav"
import { deepOverride } from "~/utils"
import { createLogger } from "~/utils/core/logger"
import { normalizeAppLanguage } from "~/utils/i18n/language"

const logger = createLogger("UserPreferences")

export interface TempWindowFallbackPreferences {
  enabled: boolean
  useInPopup: boolean
  useInSidePanel: boolean
  useInOptions: boolean
  useForAutoRefresh: boolean
  useForManualRefresh: boolean
  /**
   * Preferred temporary context type for protection bypass.
   * - "tab": Open a temporary tab (default)
   * - "window": Open a popup window
   * - "composite": Open temporary tabs inside a shared window
   */
  tempContextMode: "tab" | "window" | "composite"
}

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
   * Controls whether the extension automatically provisions a default API key
   * (token) after successfully adding an account.
   *
   * Optional for backward compatibility with stored preferences created before
   * this flag existed. Missing values MUST be treated as enabled via defaults.
   */
  autoProvisionKeyOnAccountAdd?: boolean

  /**
   * Controls whether the add-account dialog automatically prefills the site URL
   * field from the current browser tab's origin.
   *
   * Optional for backward compatibility with stored preferences created before
   * this flag existed. Missing values MUST be treated as disabled via defaults.
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
   * this capability existed. Missing values MUST be treated as disabled via
   * defaults and migration.
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

  // 管理站点类型 (用户可以选择管理 New API / Done Hub / Veloera / Octopus / AxonHub / Claude Code Hub)
  managedSiteType: ManagedSiteType

  // CLIProxyAPI 管理接口配置
  cliProxy?: CliProxyConfig

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

export const PREFERENCE_WRITE_FAILURE_TYPES = {
  Stale: "stale",
  StorageError: "storage-error",
} as const

export type PreferenceWriteFailureType =
  (typeof PREFERENCE_WRITE_FAILURE_TYPES)[keyof typeof PREFERENCE_WRITE_FAILURE_TYPES]

export type PreferenceWriteConflict = {
  type: typeof PREFERENCE_WRITE_FAILURE_TYPES.Stale
  expectedLastUpdated: number
  actualLastUpdated: number
}

export type PreferenceWriteFailure =
  | PreferenceWriteConflict
  | {
      type: typeof PREFERENCE_WRITE_FAILURE_TYPES.StorageError
      error: unknown
    }

export type PreferenceWriteResult =
  | {
      ok: true
      preferences: UserPreferences
    }
  | {
      ok: false
      reason: PreferenceWriteFailure
    }

// Stable template used for field-level defaults.
// Use `createDefaultPreferences()` when a fresh preference object is required.

// 默认配置
export const DEFAULT_PREFERENCES: UserPreferences = {
  activeTab: DATA_TYPE_CASHFLOW,
  currencyType: "USD",
  showTodayCashflow: true,
  sortField: DATA_TYPE_BALANCE, // 与 UI_CONSTANTS.SORT.DEFAULT_FIELD 保持一致
  sortOrder: "desc", // 与 UI_CONSTANTS.SORT.DEFAULT_ORDER 保持一致
  actionClickBehavior: TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup,
  openChangelogOnUpdate: true,
  autoProvisionKeyOnAccountAdd: false, // 默认关闭，避免添加账号时无意创建密钥
  autoFillCurrentSiteUrlOnAccountAdd: false,
  warnOnDuplicateAccountAdd: true,
  accountAutoRefresh: DEFAULT_ACCOUNT_AUTO_REFRESH,
  usageHistory: DEFAULT_USAGE_HISTORY_PREFERENCES,
  balanceHistory: DEFAULT_BALANCE_HISTORY_PREFERENCES,
  showHealthStatus: true, // 默认显示健康状态
  webdav: DEFAULT_WEBDAV_SETTINGS,
  lastUpdated: 0,
  sharedPreferencesLastUpdated: 0,
  newApi: DEFAULT_NEW_API_CONFIG,
  doneHub: DEFAULT_DONE_HUB_CONFIG,
  veloera: DEFAULT_VELOERA_CONFIG,
  octopus: DEFAULT_OCTOPUS_CONFIG,
  axonHub: DEFAULT_AXON_HUB_CONFIG,
  claudeCodeHub: DEFAULT_CLAUDE_CODE_HUB_CONFIG,
  managedSiteType: SITE_TYPES.NEW_API,
  cliProxy: DEFAULT_CLI_PROXY_CONFIG,
  claudeCodeRouter: DEFAULT_CLAUDE_CODE_ROUTER_CONFIG,
  managedSiteModelSync: {
    enabled: false,
    interval: 24 * 60 * 60 * 1000, // 24小时
    concurrency: 2, // 降低并发数，避免触发速率限制
    maxRetries: 2,
    channelProcessingTimeout: 0,
    rateLimit: {
      requestsPerMinute: 20, // 每分钟20个请求
      burst: 5, // 允许5个突发请求
    },
    allowedModels: [],
    globalChannelModelFilters: [],
  },
  autoCheckin: {
    globalEnabled: true,
    pretriggerDailyOnUiOpen: false,
    notifyUiOnCompletion: true,
    windowStart: "09:00",
    windowEnd: "23:00",
    scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.RANDOM,
    deterministicTime: "09:00",
    retryStrategy: {
      enabled: false,
      intervalMinutes: 30,
      maxAttemptsPerDay: 3,
    },
  },
  modelRedirect: DEFAULT_MODEL_REDIRECT_PREFERENCES,
  redemptionAssist: DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
  webAiApiCheck: DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
  sortingPriorityConfig: undefined,
  themeMode: "system",
  language: undefined, // Default to undefined to trigger browser detection
  logging: getDefaultLoggingPreferences(),
  preferencesVersion: CURRENT_PREFERENCES_VERSION,
  tempWindowFallback: {
    enabled: true,
    useInPopup: true,
    useInSidePanel: true,
    useInOptions: true,
    useForAutoRefresh: true,
    useForManualRefresh: true,
    tempContextMode: "composite",
  },
  tempWindowFallbackReminder: {
    dismissed: false,
  },
  taskNotifications: DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  siteAnnouncementNotifications: DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
}

/**
 * Creates a new UserPreferences object with default values and current timestamps.
 * @param now - Optional timestamp to use for lastUpdated and sharedPreferencesLastUpdated (defaults to current time)
 */
export function createDefaultPreferences(now = Date.now()): UserPreferences {
  const timestamp = now

  return {
    ...structuredClone(DEFAULT_PREFERENCES),
    lastUpdated: timestamp,
    sharedPreferencesLastUpdated: timestamp,
  }
}

/**
 * Creates a read-only default preferences object with timestamps set to the last updated time of the default preferences.
 */
function createReadOnlyDefaultPreferences(): UserPreferences {
  return createDefaultPreferences(DEFAULT_PREFERENCES.lastUpdated)
}

/**
 * Runs migrations and normalizes shared preference metadata for a given preferences object.
 */
function migrateAndNormalizePreferences(
  preferences: UserPreferences,
): UserPreferences {
  return normalizeSharedPreferencesMetadata(migratePreferences(preferences))
}

/**
 * Stamps the given preferences object with updated timestamps and preferences version.
 */
function stampPreferencesMetadata(
  preferences: UserPreferences,
  input: {
    lastUpdated: number
    sharedPreferencesLastUpdated: number
  },
): UserPreferences {
  return {
    ...preferences,
    lastUpdated: input.lastUpdated,
    sharedPreferencesLastUpdated: input.sharedPreferencesLastUpdated,
    preferencesVersion: CURRENT_PREFERENCES_VERSION,
  }
}

class UserPreferencesService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(STORAGE_LOCKS.USER_PREFERENCES, work)
  }

  private async readPreferencesSnapshot(): Promise<UserPreferences> {
    const storedPreferences = (await this.storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as UserPreferences | undefined
    const defaultPreferences = createReadOnlyDefaultPreferences()
    const preferences = storedPreferences ?? defaultPreferences

    const migratedPreferences = migrateAndNormalizePreferences(preferences)

    return deepOverride(defaultPreferences, migratedPreferences)
  }

  /**
   * Get user preferences (with migration + defaults merged) without mutating storage.
   */
  async getPreferences(): Promise<UserPreferences> {
    try {
      return await this.readPreferencesSnapshot()
    } catch (error) {
      logger.error("获取用户偏好设置失败", error)
      return createReadOnlyDefaultPreferences()
    }
  }

  /**
   * Save partial user preferences (deep merge) and return a typed write result.
   */
  async savePreferencesWithResult(
    preferences: DeepPartial<UserPreferences>,
    options?: {
      expectedLastUpdated?: number
    },
  ): Promise<PreferenceWriteResult> {
    try {
      const writeResult = await this.withStorageWriteLock(async () => {
        const currentPreferences = await this.readPreferencesSnapshot()
        if (
          typeof options?.expectedLastUpdated === "number" &&
          Number.isFinite(options.expectedLastUpdated) &&
          currentPreferences.lastUpdated !== options.expectedLastUpdated
        ) {
          return {
            ok: false,
            reason: {
              type: PREFERENCE_WRITE_FAILURE_TYPES.Stale,
              expectedLastUpdated: options.expectedLastUpdated,
              actualLastUpdated: currentPreferences.lastUpdated,
            },
          } satisfies PreferenceWriteResult
        }

        const timestamp = Date.now()
        const sharedPreferencesLastUpdated = patchTouchesSharedPreferences(
          preferences,
        )
          ? timestamp
          : getSharedPreferencesLastUpdated(currentPreferences)

        const nextPreferences = stampPreferencesMetadata(
          deepOverride(currentPreferences, preferences),
          {
            lastUpdated: timestamp,
            sharedPreferencesLastUpdated,
          },
        )

        await this.storage.set(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
          nextPreferences,
        )

        return {
          ok: true,
          preferences: nextPreferences,
        } satisfies PreferenceWriteResult
      })

      if (!writeResult.ok && writeResult.reason.type === "stale") {
        logger.debug("跳过过期的偏好设置写入", {
          expectedLastUpdated: writeResult.reason.expectedLastUpdated,
          actualLastUpdated: writeResult.reason.actualLastUpdated,
        })
        return writeResult
      }

      if (writeResult.ok) {
        logger.debug("偏好设置保存成功", {
          lastUpdated: writeResult.preferences.lastUpdated,
          sharedPreferencesLastUpdated:
            writeResult.preferences.sharedPreferencesLastUpdated,
          preferencesVersion: writeResult.preferences.preferencesVersion,
        })
      }

      return writeResult
    } catch (error) {
      logger.error("保存偏好设置失败", error)
      return {
        ok: false,
        reason: {
          type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
          error,
        },
      }
    }
  }

  /**
   * Save partial user preferences (deep merge) and stamp timestamps/version.
   */
  async savePreferences(
    preferences: DeepPartial<UserPreferences>,
    options?: {
      expectedLastUpdated?: number
    },
  ): Promise<PreferenceWriteResult> {
    return this.savePreferencesWithResult(preferences, options)
  }

  /**
   * Update active tab preference.
   */
  async updateActiveTab(
    activeTab: DashboardTabType,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ activeTab })
  }

  /**
   * Enable/disable automatically showing the inline update log after updates.
   * @param enabled - When true, shows the update log on first UI open after update.
   */
  async updateOpenChangelogOnUpdate(
    enabled: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ openChangelogOnUpdate: enabled })
  }

  /**
   * Enable/disable automatically provisioning a default API key (token) after
   * successfully adding an account.
   * @param enabled - When true, runs token provisioning after account add.
   */
  async updateAutoProvisionKeyOnAccountAdd(
    enabled: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ autoProvisionKeyOnAccountAdd: enabled })
  }

  /**
   * Enable/disable automatically prefilling the add-account URL field from the
   * current browser tab.
   * @param enabled - When true, add-account starts with the current site's origin.
   */
  async updateAutoFillCurrentSiteUrlOnAccountAdd(
    enabled: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ autoFillCurrentSiteUrlOnAccountAdd: enabled })
  }

  /**
   * Enable/disable the duplicate-account add confirmation modal.
   * @param enabled - When true, adding an account whose site URL already exists
   * prompts for confirmation.
   */
  async updateWarnOnDuplicateAccountAdd(
    enabled: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ warnOnDuplicateAccountAdd: enabled })
  }

  /**
   * Update currency preference.
   */
  async updateCurrencyType(
    currencyType: CurrencyType,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ currencyType })
  }

  /**
   * Toggle whether "today cashflow" statistics are displayed and fetched.
   *
   * When disabled, expensive log pagination requests are skipped and today fields
   * are treated as zero during refresh.
   */
  async updateShowTodayCashflow(
    showTodayCashflow: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ showTodayCashflow })
  }

  /**
   * Update sort field/order.
   */
  async updateSortConfig(
    sortField: ActiveSortField,
    sortOrder: SortOrder,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ sortField, sortOrder })
  }

  /**
   * Toggle health status visibility.
   */
  async updateShowHealthStatus(
    showHealthStatus: boolean,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ showHealthStatus })
  }

  /**
   * Update WebDAV credentials/settings.
   */
  async updateWebdavSettings(settings: {
    url?: string
    username?: string
    password?: string
    backupEncryptionEnabled?: boolean
    backupEncryptionPassword?: string
    syncData?: WebDAVSettings["syncData"]
  }): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webdav: settings,
    })
  }

  /**
   * Update WebDAV auto-sync settings.
   */
  async updateWebdavAutoSyncSettings(settings: {
    autoSync?: boolean
    syncInterval?: number
    syncStrategy?: WebDAVSettings["syncStrategy"]
  }): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webdav: settings,
    })
  }

  /**
   * Reset all preferences to defaults.
   */
  async resetToDefaults(): Promise<PreferenceWriteResult> {
    try {
      const nextPreferences = createDefaultPreferences()
      await this.withStorageWriteLock(async () => {
        await this.storage.set(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
          nextPreferences,
        )
      })
      logger.info("已重置为默认设置")
      return {
        ok: true,
        preferences: nextPreferences,
      }
    } catch (error) {
      logger.error("重置设置失败", error)
      return {
        ok: false,
        reason: {
          type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
          error,
        },
      }
    }
  }

  /**
   * Clear stored preferences (removes key).
   */
  async clearPreferences(): Promise<PreferenceWriteResult> {
    try {
      await this.withStorageWriteLock(async () => {
        await this.storage.remove(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
        )
      })
      logger.info("偏好设置已清空")
      return {
        ok: true,
        preferences: createDefaultPreferences(),
      }
    } catch (error) {
      logger.error("清空偏好设置失败", error)
      return {
        ok: false,
        reason: {
          type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
          error,
        },
      }
    }
  }

  /**
   * Export preferences (returns current with migrations applied).
   */
  async exportPreferences(): Promise<UserPreferences> {
    return this.getPreferences()
  }

  /**
   * Import preferences (runs migration before saving).
   *
   * WebDAV import policy:
   * - Manual import is allowed to restore the full preference object.
   * - WebDAV-based restore/sync flows may opt-in to preserving the current
   *   device's WebDAV-local fields (`webdav` + `accountAutoRefresh`) so shared
   *   preference sync never overwrites device-local operational settings.
   */
  async importPreferences(
    preferences: UserPreferences,
    options?: {
      preserveWebdav?: boolean
    },
  ): Promise<PreferenceWriteResult> {
    try {
      const importedPreferences = await this.withStorageWriteLock(async () => {
        const migratedPreferences = migrateAndNormalizePreferences(preferences)

        const currentPreferences = options?.preserveWebdav
          ? await this.readPreferencesSnapshot()
          : null
        const importedAt = Date.now()

        const preferencesToStore =
          options?.preserveWebdav && currentPreferences
            ? restoreWebdavLocalOnlyPreferences(
                migratedPreferences,
                currentPreferences,
              )
            : migratedPreferences

        const importedSharedPreferencesLastUpdated =
          getSharedPreferencesLastUpdated(preferencesToStore)
        const sharedPreferencesLastUpdated = options?.preserveWebdav
          ? importedSharedPreferencesLastUpdated > 0
            ? importedSharedPreferencesLastUpdated
            : importedAt
          : importedAt

        const nextPreferences = stampPreferencesMetadata(preferencesToStore, {
          lastUpdated: importedAt,
          sharedPreferencesLastUpdated,
        })

        await this.storage.set(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
          nextPreferences,
        )
        return nextPreferences
      })
      logger.info("偏好设置导入成功，已迁移至最新版本")
      return {
        ok: true,
        preferences: importedPreferences,
      }
    } catch (error) {
      logger.error("导入偏好设置失败", error)
      return {
        ok: false,
        reason: {
          type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
          error,
        },
      }
    }
  }

  async getSortingPriorityConfig(): Promise<SortingPriorityConfig> {
    const prefs = await this.getPreferences()
    // Migrations are already handled in getPreferences()
    return prefs.sortingPriorityConfig || DEFAULT_SORTING_PRIORITY_CONFIG
  }

  async setSortingPriorityConfig(
    config: SortingPriorityConfig,
  ): Promise<PreferenceWriteResult> {
    config.lastModified = Date.now()
    return this.savePreferences({ sortingPriorityConfig: config })
  }

  async resetSortingPriorityConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      sortingPriorityConfig: createDefaultSortingPriorityConfig(),
    })
  }

  /**
   * Get language preference.
   */
  async getLanguage(): Promise<string | undefined> {
    const preferences = await this.getPreferences()
    return normalizeAppLanguage(preferences.language) ?? preferences.language
  }

  /**
   * Set language preference.
   */
  async setLanguage(language: string): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      language: normalizeAppLanguage(language) ?? language,
    })
  }

  /**
   * Get logging preferences (console enablement + minimum level).
   */
  async getLoggingPreferences(): Promise<LoggingPreferences> {
    const preferences = await this.getPreferences()
    return preferences.logging
  }

  /**
   * Update logging preferences (deep merge).
   */
  async updateLoggingPreferences(
    updates: Partial<LoggingPreferences>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({ logging: updates })
  }

  /**
   * Reset display settings (currency + active tab).
   */
  async resetDisplaySettings(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      activeTab: DEFAULT_PREFERENCES.activeTab,
      currencyType: DEFAULT_PREFERENCES.currencyType,
      showTodayCashflow: DEFAULT_PREFERENCES.showTodayCashflow,
    })
  }

  /**
   * Reset auto refresh config.
   */
  async resetAutoRefreshConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      accountAutoRefresh: DEFAULT_PREFERENCES.accountAutoRefresh,
    })
  }

  /**
   * Reset New API config.
   */
  async resetNewApiConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      newApi: DEFAULT_PREFERENCES.newApi,
    })
  }

  /**
   * Update Veloera config.
   */
  async updateVeloeraConfig(
    config: Partial<VeloeraConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      veloera: config,
    })
  }

  /**
   * Update Done Hub config.
   */
  async updateDoneHubConfig(
    config: Partial<DoneHubConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      doneHub: config,
    })
  }

  /**
   * Reset Veloera config.
   */
  async resetVeloeraConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      veloera: DEFAULT_PREFERENCES.veloera,
    })
  }

  /**
   * Reset Done Hub config.
   */
  async resetDoneHubConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      doneHub: DEFAULT_DONE_HUB_CONFIG,
    })
  }

  /**
   * Update Octopus config.
   */
  async updateOctopusConfig(
    config: Partial<OctopusConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      octopus: config,
    })
  }

  /**
   * Update AxonHub config.
   */
  async updateAxonHubConfig(
    config: Partial<AxonHubConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      axonHub: config,
    })
  }

  /**
   * Update Claude Code Hub config.
   */
  async updateClaudeCodeHubConfig(
    config: Partial<ClaudeCodeHubConfig>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      claudeCodeHub: config,
    })
  }

  /**
   * Reset Octopus config.
   */
  async resetOctopusConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      octopus: DEFAULT_PREFERENCES.octopus,
    })
  }

  /**
   * Reset AxonHub config.
   */
  async resetAxonHubConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      axonHub: DEFAULT_PREFERENCES.axonHub,
    })
  }

  /**
   * Reset Claude Code Hub config.
   */
  async resetClaudeCodeHubConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      claudeCodeHub: DEFAULT_PREFERENCES.claudeCodeHub,
    })
  }

  /**
   * Update managed site type (new-api, veloera, done-hub, or octopus).
   */
  async updateManagedSiteType(
    siteType: ManagedSiteType,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      managedSiteType: siteType,
    })
  }

  /**
   * Get managed site configuration based on current managedSiteType.
   */
  async getManagedSiteConfig(): Promise<{
    siteType: ManagedSiteType
    config:
      | NewApiConfig
      | DoneHubConfig
      | VeloeraConfig
      | OctopusConfig
      | AxonHubConfig
      | ClaudeCodeHubConfig
  }> {
    const prefs = await this.getPreferences()
    const siteType = prefs.managedSiteType || SITE_TYPES.NEW_API
    let config:
      | NewApiConfig
      | DoneHubConfig
      | VeloeraConfig
      | OctopusConfig
      | AxonHubConfig
      | ClaudeCodeHubConfig
    if (siteType === SITE_TYPES.AXON_HUB) {
      config = prefs.axonHub || DEFAULT_AXON_HUB_CONFIG
    } else if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
      config = prefs.claudeCodeHub || DEFAULT_CLAUDE_CODE_HUB_CONFIG
    } else if (siteType === SITE_TYPES.OCTOPUS) {
      config = prefs.octopus || DEFAULT_OCTOPUS_CONFIG
    } else if (siteType === SITE_TYPES.VELOERA) {
      config = prefs.veloera
    } else if (siteType === SITE_TYPES.DONE_HUB) {
      config = prefs.doneHub ?? DEFAULT_DONE_HUB_CONFIG
    } else {
      config = prefs.newApi
    }
    return { siteType, config }
  }

  /**
   * Reset New API Model Sync config.
   */
  async resetNewApiModelSyncConfig(): Promise<PreferenceWriteResult> {
    return this.resetManagedSiteModelSyncConfig()
  }

  async resetManagedSiteModelSyncConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      managedSiteModelSync: DEFAULT_PREFERENCES.managedSiteModelSync,
    })
  }

  async resetCliProxyConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      cliProxy: DEFAULT_PREFERENCES.cliProxy,
    })
  }

  async resetClaudeCodeRouterConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      claudeCodeRouter: DEFAULT_PREFERENCES.claudeCodeRouter,
    })
  }

  /**
   * Reset auto check-in config.
   */
  async resetAutoCheckinConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      autoCheckin: DEFAULT_PREFERENCES.autoCheckin,
    })
  }

  /**
   * Reset model redirect config.
   */
  async resetModelRedirectConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      modelRedirect: DEFAULT_PREFERENCES.modelRedirect,
    })
  }

  /**
   * Reset redemption assist config.
   */
  async resetRedemptionAssist(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      redemptionAssist: DEFAULT_PREFERENCES.redemptionAssist,
    })
  }

  /**
   * Reset Web AI API Check config.
   */
  async resetWebAiApiCheck(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webAiApiCheck: DEFAULT_PREFERENCES.webAiApiCheck,
    })
  }

  /**
   * Update Web AI API Check config from extension contexts without a React provider.
   */
  async updateWebAiApiCheck(
    updates: DeepPartial<WebAiApiCheckPreferences>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webAiApiCheck: updates,
    })
  }

  /**
   * Reset WebDAV config.
   */
  async resetWebdavConfig(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      webdav: DEFAULT_PREFERENCES.webdav,
    })
  }

  /**
   * Update task-notification preferences.
   */
  async updateTaskNotifications(
    updates: Partial<TaskNotificationPreferences>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      taskNotifications: updates,
    })
  }

  /**
   * Reset task-notification preferences.
   */
  async resetTaskNotifications(): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      taskNotifications: DEFAULT_PREFERENCES.taskNotifications,
    })
  }

  /**
   * Update site-announcement notification preferences.
   */
  async updateSiteAnnouncementNotifications(
    updates: Partial<SiteAnnouncementPreferences>,
  ): Promise<PreferenceWriteResult> {
    return this.savePreferences({
      siteAnnouncementNotifications: updates,
    })
  }
}

// 创建单例实例
export const userPreferences = new UserPreferencesService()
