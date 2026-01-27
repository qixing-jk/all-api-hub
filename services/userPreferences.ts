import { isEqual } from "lodash-es"

import { Storage } from "@plasmohq/storage"

import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { NEW_API, VELOERA, type ManagedSiteType } from "~/constants/siteType"
import {
  CURRENT_PREFERENCES_VERSION,
  migratePreferences,
} from "~/services/configMigration/preferences/preferencesMigration"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/storageKeys"
import { CurrencyType, DashboardTabType, SortField, SortOrder } from "~/types"
import {
  AccountAutoRefresh,
  DEFAULT_ACCOUNT_AUTO_REFRESH,
} from "~/types/accountAutoRefresh"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  AutoCheckinPreferences,
} from "~/types/autoCheckin"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import {
  DEFAULT_CLAUDE_CODE_ROUTER_CONFIG,
  type ClaudeCodeRouterConfig,
} from "~/types/claudeCodeRouterConfig"
import {
  DEFAULT_CLI_PROXY_CONFIG,
  type CliProxyConfig,
} from "~/types/cliProxyConfig"
import {
  getDefaultLoggingPreferences,
  type LoggingPreferences,
} from "~/types/logging"
import {
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
  type ModelRedirectPreferences,
} from "~/types/managedSiteModelRedirect"
import { DEFAULT_NEW_API_CONFIG, NewApiConfig } from "~/types/newApiConfig"
import type { SortingPriorityConfig } from "~/types/sorting"
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
import { createLogger } from "~/utils/logger"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

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

export interface RedemptionAssistPreferences {
  enabled: boolean
  /**
   * When enabled, treat any 32-character non-whitespace token as a possible
   * redemption code (do not require strict hex charset).
   */
  relaxedCodeValidation: boolean
  urlWhitelist: RedemptionAssistUrlWhitelistPreferences
}

// 用户偏好设置类型定义
export interface UserPreferences {
  themeMode: ThemeMode
  /**
   * Controls what happens when the toolbar icon is clicked.
   * - popup: open extension popup (default)
   * - sidepanel: open side panel (if supported)
   */
  actionClickBehavior?: "popup" | "sidepanel"
  /**
   * language preference
   */
  language?: string

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

  // AccountList 相关配置
  /**
   * 用户自定义排序字段
   */
  sortField: SortField
  /**
   * 用户自定义排序顺序
   */
  sortOrder: SortOrder

  // 自动刷新相关配置
  accountAutoRefresh: AccountAutoRefresh

  // Usage history sync + analytics
  usageHistory?: UsageHistoryPreferences

  // 是否显示健康状态
  showHealthStatus: boolean

  // WebDAV 备份/同步配置
  webdav: WebDAVSettings

  // New API 相关配置
  newApi: NewApiConfig

  // Veloera 相关配置
  veloera: VeloeraConfig

  // 管理站点类型 (用户可以选择管理 New API 或 Veloera)
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
   * 最后更新时间
   */
  lastUpdated: number
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

// 默认配置
export const DEFAULT_PREFERENCES: UserPreferences = {
  activeTab: DATA_TYPE_CASHFLOW,
  currencyType: "USD",
  sortField: DATA_TYPE_BALANCE, // 与 UI_CONSTANTS.SORT.DEFAULT_FIELD 保持一致
  sortOrder: "desc", // 与 UI_CONSTANTS.SORT.DEFAULT_ORDER 保持一致
  actionClickBehavior: "popup",
  accountAutoRefresh: DEFAULT_ACCOUNT_AUTO_REFRESH,
  usageHistory: DEFAULT_USAGE_HISTORY_PREFERENCES,
  showHealthStatus: true, // 默认显示健康状态
  webdav: DEFAULT_WEBDAV_SETTINGS,
  lastUpdated: Date.now(),
  newApi: DEFAULT_NEW_API_CONFIG,
  veloera: DEFAULT_VELOERA_CONFIG,
  managedSiteType: NEW_API,
  cliProxy: DEFAULT_CLI_PROXY_CONFIG,
  claudeCodeRouter: DEFAULT_CLAUDE_CODE_ROUTER_CONFIG,
  managedSiteModelSync: {
    enabled: false,
    interval: 24 * 60 * 60 * 1000, // 24小时
    concurrency: 2, // 降低并发数，避免触发速率限制
    maxRetries: 2,
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
  redemptionAssist: {
    enabled: true,
    relaxedCodeValidation: true,
    urlWhitelist: {
      enabled: true,
      patterns: ["cdk.linux.do", "cdk.hybgzs.com", "qd.x666.me"],
      includeAccountSiteUrls: true,
      includeCheckInAndRedeemUrls: true,
    },
  },
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
}

class UserPreferencesService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  /**
   * Get user preferences (with migration + defaults merged).
   * Saves back if migration updated stored prefs.
   */
  async getPreferences(): Promise<UserPreferences> {
    try {
      const storedPreferences = (await this.storage.get(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      )) as UserPreferences | undefined
      const preferences = storedPreferences || DEFAULT_PREFERENCES

      // Run migrations if needed
      const migratedPreferences = migratePreferences(preferences)

      const finalPreferences = deepOverride(
        DEFAULT_PREFERENCES,
        migratedPreferences,
      )

      // If migration changed preferences, save the updated version
      if (!isEqual(finalPreferences, storedPreferences)) {
        await this.storage.set(
          USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
          finalPreferences,
        )
      }

      return finalPreferences
    } catch (error) {
      logger.error("获取用户偏好设置失败", error)
      return DEFAULT_PREFERENCES
    }
  }

  /**
   * Save partial user preferences (deep merge) and stamp lastUpdated/version.
   */
  async savePreferences(
    preferences: DeepPartial<UserPreferences>,
  ): Promise<boolean> {
    try {
      const currentPreferences = await this.getPreferences()

      const updatedPreferences: UserPreferences = deepOverride(
        currentPreferences,
        preferences,
        {
          lastUpdated: Date.now(),
          preferencesVersion: CURRENT_PREFERENCES_VERSION,
        },
      )

      await this.storage.set(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
        updatedPreferences,
      )
      logger.debug("偏好设置保存成功", {
        lastUpdated: updatedPreferences.lastUpdated,
        preferencesVersion: updatedPreferences.preferencesVersion,
      })
      return true
    } catch (error) {
      logger.error("保存偏好设置失败", error)
      return false
    }
  }

  /**
   * Update active tab preference.
   */
  async updateActiveTab(activeTab: DashboardTabType): Promise<boolean> {
    return this.savePreferences({ activeTab })
  }

  /**
   * Update currency preference.
   */
  async updateCurrencyType(currencyType: CurrencyType): Promise<boolean> {
    return this.savePreferences({ currencyType })
  }

  /**
   * Update sort field/order.
   */
  async updateSortConfig(
    sortField: SortField,
    sortOrder: SortOrder,
  ): Promise<boolean> {
    return this.savePreferences({ sortField, sortOrder })
  }

  /**
   * Toggle health status visibility.
   */
  async updateShowHealthStatus(showHealthStatus: boolean): Promise<boolean> {
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
  }): Promise<boolean> {
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
  }): Promise<boolean> {
    return this.savePreferences({
      webdav: settings,
    })
  }

  /**
   * Reset all preferences to defaults.
   */
  async resetToDefaults(): Promise<boolean> {
    try {
      await this.storage.set(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
        DEFAULT_PREFERENCES,
      )
      logger.info("已重置为默认设置")
      return true
    } catch (error) {
      logger.error("重置设置失败", error)
      return false
    }
  }

  /**
   * Clear stored preferences (removes key).
   */
  async clearPreferences(): Promise<boolean> {
    try {
      await this.storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
      logger.info("偏好设置已清空")
      return true
    } catch (error) {
      logger.error("清空偏好设置失败", error)
      return false
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
   * - Manual import is allowed to restore `webdav` settings from the backup.
   * - WebDAV-based restore/sync flows may opt-in to preserving the current
   *   device's WebDAV config to avoid accidentally switching targets.
   */
  async importPreferences(
    preferences: UserPreferences,
    options?: {
      preserveWebdav?: boolean
    },
  ): Promise<boolean> {
    try {
      // Migrate imported preferences to ensure compatibility
      const migratedPreferences = migratePreferences(preferences)

      const currentPreferences = options?.preserveWebdav
        ? await this.getPreferences()
        : null

      await this.storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
        ...migratedPreferences,
        ...(options?.preserveWebdav && currentPreferences
          ? { webdav: currentPreferences.webdav }
          : null),
        lastUpdated: Date.now(),
      })
      logger.info("偏好设置导入成功，已迁移至最新版本")
      return true
    } catch (error) {
      logger.error("导入偏好设置失败", error)
      return false
    }
  }

  async getSortingPriorityConfig(): Promise<SortingPriorityConfig> {
    const prefs = await this.getPreferences()
    // Migrations are already handled in getPreferences()
    return prefs.sortingPriorityConfig || DEFAULT_SORTING_PRIORITY_CONFIG
  }

  async setSortingPriorityConfig(
    config: SortingPriorityConfig,
  ): Promise<boolean> {
    config.lastModified = Date.now()
    return this.savePreferences({ sortingPriorityConfig: config })
  }

  async resetSortingPriorityConfig(): Promise<boolean> {
    const prefs = await this.getPreferences()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sortingPriorityConfig, ...rest } = prefs
    return this.savePreferences(rest as any)
  }

  /**
   * Get language preference.
   */
  async getLanguage(): Promise<string | undefined> {
    const preferences = await this.getPreferences()
    return preferences.language
  }

  /**
   * Set language preference.
   */
  async setLanguage(language: string): Promise<boolean> {
    return this.savePreferences({ language })
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
  ): Promise<boolean> {
    return this.savePreferences({ logging: updates })
  }

  /**
   * Reset display settings (currency + active tab).
   */
  async resetDisplaySettings(): Promise<boolean> {
    return this.savePreferences({
      activeTab: DEFAULT_PREFERENCES.activeTab,
      currencyType: DEFAULT_PREFERENCES.currencyType,
    })
  }

  /**
   * Reset auto refresh config.
   */
  async resetAutoRefreshConfig(): Promise<boolean> {
    return this.savePreferences({
      accountAutoRefresh: DEFAULT_PREFERENCES.accountAutoRefresh,
    })
  }

  /**
   * Reset New API config.
   */
  async resetNewApiConfig(): Promise<boolean> {
    return this.savePreferences({
      newApi: DEFAULT_PREFERENCES.newApi,
    })
  }

  /**
   * Update Veloera config.
   */
  async updateVeloeraConfig(config: Partial<VeloeraConfig>): Promise<boolean> {
    return this.savePreferences({
      veloera: config,
    })
  }

  /**
   * Reset Veloera config.
   */
  async resetVeloeraConfig(): Promise<boolean> {
    return this.savePreferences({
      veloera: DEFAULT_PREFERENCES.veloera,
    })
  }

  /**
   * Update managed site type (new-api or veloera).
   */
  async updateManagedSiteType(siteType: ManagedSiteType): Promise<boolean> {
    return this.savePreferences({
      managedSiteType: siteType,
    })
  }

  /**
   * Get managed site configuration based on current managedSiteType.
   */
  async getManagedSiteConfig(): Promise<{
    siteType: ManagedSiteType
    config: NewApiConfig | VeloeraConfig
  }> {
    const prefs = await this.getPreferences()
    const siteType = prefs.managedSiteType || NEW_API
    const config = siteType === VELOERA ? prefs.veloera : prefs.newApi
    return { siteType, config }
  }

  /**
   * Reset New API Model Sync config.
   */
  async resetNewApiModelSyncConfig(): Promise<boolean> {
    return this.resetManagedSiteModelSyncConfig()
  }

  async resetManagedSiteModelSyncConfig(): Promise<boolean> {
    return this.savePreferences({
      managedSiteModelSync: DEFAULT_PREFERENCES.managedSiteModelSync,
    })
  }

  async resetCliProxyConfig(): Promise<boolean> {
    return this.savePreferences({
      cliProxy: DEFAULT_PREFERENCES.cliProxy,
    })
  }

  async resetClaudeCodeRouterConfig(): Promise<boolean> {
    return this.savePreferences({
      claudeCodeRouter: DEFAULT_PREFERENCES.claudeCodeRouter,
    })
  }

  /**
   * Reset auto check-in config.
   */
  async resetAutoCheckinConfig(): Promise<boolean> {
    return this.savePreferences({
      autoCheckin: DEFAULT_PREFERENCES.autoCheckin,
    })
  }

  /**
   * Reset model redirect config.
   */
  async resetModelRedirectConfig(): Promise<boolean> {
    return this.savePreferences({
      modelRedirect: DEFAULT_PREFERENCES.modelRedirect,
    })
  }

  /**
   * Reset redemption assist config.
   */
  async resetRedemptionAssist(): Promise<boolean> {
    return this.savePreferences({
      redemptionAssist: DEFAULT_PREFERENCES.redemptionAssist,
    })
  }

  /**
   * Reset WebDAV config.
   */
  async resetWebdavConfig(): Promise<boolean> {
    return this.savePreferences({
      webdav: DEFAULT_PREFERENCES.webdav,
    })
  }

  /**
   * Reset theme and language.
   */
  async resetThemeAndLanguage(): Promise<boolean> {
    return this.savePreferences({
      themeMode: DEFAULT_PREFERENCES.themeMode,
      language: DEFAULT_PREFERENCES.language,
    })
  }
}

// 创建单例实例
export const userPreferences = new UserPreferencesService()
