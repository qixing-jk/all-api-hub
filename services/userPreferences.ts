import { isEqual } from "lodash-es"

import { Storage } from "@plasmohq/storage"

import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import {
  CURRENT_PREFERENCES_VERSION,
  migratePreferences
} from "~/services/configMigration/preferences/preferencesMigration.ts"
import {
  BalanceType,
  CurrencyType,
  DEFAULT_WEBDAV_SETTINGS,
  SortField,
  SortOrder,
  WebDAVSettings
} from "~/types"
import {
  AccountAutoRefresh,
  DEFAULT_ACCOUNT_AUTO_REFRESH
} from "~/types/accountAutoRefresh.ts"
import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import {
  DEFAULT_MODEL_REDIRECT_PREFERENCES,
  type ModelRedirectPreferences
} from "~/types/modelRedirect"
import { DEFAULT_NEW_API_CONFIG, NewApiConfig } from "~/types/newApiConfig.ts"
import type { SortingPriorityConfig } from "~/types/sorting"
import type { ThemeMode } from "~/types/theme"
import { DeepPartial } from "~/types/utils.ts"
import { deepOverride } from "~/utils"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

// 用户偏好设置类型定义
export interface UserPreferences {
  themeMode: ThemeMode
  /**
   * language preference
   */
  language?: string

  // BalanceSection 相关配置
  /**
   * 金额标签页状态
   */
  activeTab: BalanceType
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

  // 是否显示健康状态
  showHealthStatus: boolean

  // WebDAV 备份/同步配置
  webdav: WebDAVSettings

  // New API 相关配置
  newApi: NewApiConfig

  // New API Model Sync 配置
  newApiModelSync: {
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
  }

  /**
   * 自定义排序
   */
  sortingPriorityConfig?: SortingPriorityConfig

  // Auto Check-in 配置
  autoCheckin: AutoCheckinPreferences

  // Model Redirect 配置
  modelRedirect: ModelRedirectPreferences

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
   * @deprecated Use newApi object instead
   */
  newApiBaseUrl?: string
  /**
   * @deprecated Use newApi object instead
   */
  newApiAdminToken?: string
  /**
   * @deprecated Use newApi object instead
   */
  newApiUserId?: string
  /**
   * @deprecated Use accountAutoRefresh instead
   */
  autoRefresh?: boolean
  /**
   * @deprecated Use accountAutoRefresh.interval instead
   */
  refreshInterval?: number
  /**
   * @deprecated Use accountAutoRefresh.minInterval instead
   */
  minRefreshInterval?: number
  /**
   * @deprecated Use accountAutoRefresh.refreshOnOpen instead
   */
  refreshOnOpen?: boolean
  /**
   * 远程备份文件完整URL（例如：https://dav.example.com/backups/all-api-hub.json）
   * @deprecated 请使用 webdav.url
   */
  webdavUrl?: string
  /**
   * WebDAV用户名
   * @deprecated 请使用 webdav.username
   */
  webdavUsername?: string
  /**
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
  webdavSyncStrategy?: "merge" | "upload_only" | "download_only"
}

// 存储键名常量
const STORAGE_KEYS = {
  USER_PREFERENCES: "user_preferences"
} as const

// 默认配置
export const DEFAULT_PREFERENCES: UserPreferences = {
  activeTab: DATA_TYPE_CONSUMPTION,
  currencyType: "USD",
  sortField: DATA_TYPE_BALANCE, // 与 UI_CONSTANTS.SORT.DEFAULT_FIELD 保持一致
  sortOrder: "desc", // 与 UI_CONSTANTS.SORT.DEFAULT_ORDER 保持一致
  accountAutoRefresh: DEFAULT_ACCOUNT_AUTO_REFRESH,
  showHealthStatus: true, // 默认显示健康状态
  webdav: DEFAULT_WEBDAV_SETTINGS,
  lastUpdated: Date.now(),
  newApi: DEFAULT_NEW_API_CONFIG,
  newApiModelSync: {
    enabled: false,
    interval: 24 * 60 * 60 * 1000, // 24小时
    concurrency: 2, // 降低并发数，避免触发速率限制
    maxRetries: 2,
    rateLimit: {
      requestsPerMinute: 20, // 每分钟20个请求
      burst: 5 // 允许5个突发请求
    },
    allowedModels: []
  },
  autoCheckin: {
    globalEnabled: false,
    windowStart: "09:00",
    windowEnd: "18:00"
  },
  modelRedirect: DEFAULT_MODEL_REDIRECT_PREFERENCES,
  sortingPriorityConfig: undefined,
  themeMode: "system",
  language: undefined, // Default to undefined to trigger browser detection
  preferencesVersion: CURRENT_PREFERENCES_VERSION
}

class UserPreferencesService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local"
    })
  }

  /**
   * 获取用户偏好设置
   */
  async getPreferences(): Promise<UserPreferences> {
    try {
      const storedPreferences = (await this.storage.get(
        STORAGE_KEYS.USER_PREFERENCES
      )) as UserPreferences | undefined
      const preferences = storedPreferences || DEFAULT_PREFERENCES

      // Run migrations if needed
      const migratedPreferences = migratePreferences(preferences)

      const finalPreferences = deepOverride(
        DEFAULT_PREFERENCES,
        migratedPreferences
      )

      // If migration changed preferences, save the updated version
      if (!isEqual(finalPreferences, storedPreferences)) {
        await this.storage.set(STORAGE_KEYS.USER_PREFERENCES, finalPreferences)
      }

      return finalPreferences
    } catch (error) {
      console.error("获取用户偏好设置失败:", error)
      return DEFAULT_PREFERENCES
    }
  }

  /**
   * 保存用户偏好设置
   */

  async savePreferences(
    preferences: DeepPartial<UserPreferences>
  ): Promise<boolean> {
    try {
      const currentPreferences = await this.getPreferences()

      const updatedPreferences: UserPreferences = deepOverride(
        currentPreferences,
        preferences,
        {
          lastUpdated: Date.now(),
          preferencesVersion: CURRENT_PREFERENCES_VERSION
        }
      )

      await this.storage.set(STORAGE_KEYS.USER_PREFERENCES, updatedPreferences)
      console.log("[UserPreferences] 偏好设置保存成功:", updatedPreferences)
      return true
    } catch (error) {
      console.error("[UserPreferences] 保存偏好设置失败:", error)
      return false
    }
  }

  /**
   * 更新活动标签页
   */
  async updateActiveTab(activeTab: BalanceType): Promise<boolean> {
    return this.savePreferences({ activeTab })
  }

  /**
   * 更新货币类型
   */
  async updateCurrencyType(currencyType: CurrencyType): Promise<boolean> {
    return this.savePreferences({ currencyType })
  }

  /**
   * 更新排序配置
   */
  async updateSortConfig(
    sortField: SortField,
    sortOrder: SortOrder
  ): Promise<boolean> {
    return this.savePreferences({ sortField, sortOrder })
  }

  /**
   * 更新健康状态显示设置
   */
  async updateShowHealthStatus(showHealthStatus: boolean): Promise<boolean> {
    return this.savePreferences({ showHealthStatus })
  }

  /**
   * 更新 WebDAV 设置
   */
  async updateWebdavSettings(settings: {
    url?: string
    username?: string
    password?: string
  }): Promise<boolean> {
    return this.savePreferences({
      webdav: settings
    })
  }

  /**
   * 更新 WebDAV 自动同步设置
   */
  async updateWebdavAutoSyncSettings(settings: {
    autoSync?: boolean
    syncInterval?: number
    syncStrategy?: WebDAVSettings["syncStrategy"]
  }): Promise<boolean> {
    return this.savePreferences({
      webdav: settings
    })
  }

  /**
   * 重置为默认设置
   */
  async resetToDefaults(): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEYS.USER_PREFERENCES, DEFAULT_PREFERENCES)
      console.log("[UserPreferences] 已重置为默认设置")
      return true
    } catch (error) {
      console.error("[UserPreferences] 重置设置失败:", error)
      return false
    }
  }

  /**
   * 清空偏好设置
   */
  async clearPreferences(): Promise<boolean> {
    try {
      await this.storage.remove(STORAGE_KEYS.USER_PREFERENCES)
      console.log("[UserPreferences] 偏好设置已清空")
      return true
    } catch (error) {
      console.error("[UserPreferences] 清空偏好设置失败:", error)
      return false
    }
  }

  /**
   * 导出偏好设置
   */
  async exportPreferences(): Promise<UserPreferences> {
    return this.getPreferences()
  }

  /**
   * 导入偏好设置
   */
  async importPreferences(preferences: UserPreferences): Promise<boolean> {
    try {
      // Migrate imported preferences to ensure compatibility
      const migratedPreferences = migratePreferences(preferences)

      await this.storage.set(STORAGE_KEYS.USER_PREFERENCES, {
        ...migratedPreferences,
        lastUpdated: Date.now()
      })
      console.log("[UserPreferences] 偏好设置导入成功，已迁移至最新版本")
      return true
    } catch (error) {
      console.error("[UserPreferences] 导入偏好设置失败:", error)
      return false
    }
  }

  async getSortingPriorityConfig(): Promise<SortingPriorityConfig> {
    const prefs = await this.getPreferences()
    // Migrations are already handled in getPreferences()
    return prefs.sortingPriorityConfig || DEFAULT_SORTING_PRIORITY_CONFIG
  }

  async setSortingPriorityConfig(
    config: SortingPriorityConfig
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
   * 获取语言偏好设置
   */
  async getLanguage(): Promise<string | undefined> {
    const preferences = await this.getPreferences()
    return preferences.language
  }

  /**
   * 更新语言偏好设置
   */
  async setLanguage(language: string): Promise<boolean> {
    return this.savePreferences({ language })
  }

  /**
   * 重置显示设置（货币单位和默认标签页）
   */
  async resetDisplaySettings(): Promise<boolean> {
    return this.savePreferences({
      activeTab: DEFAULT_PREFERENCES.activeTab,
      currencyType: DEFAULT_PREFERENCES.currencyType
    })
  }

  /**
   * 重置自动刷新设置
   */
  async resetAutoRefreshConfig(): Promise<boolean> {
    return this.savePreferences({
      accountAutoRefresh: DEFAULT_PREFERENCES.accountAutoRefresh
    })
  }

  /**
   * 重置 New API 配置
   */
  async resetNewApiConfig(): Promise<boolean> {
    return this.savePreferences({
      newApi: DEFAULT_PREFERENCES.newApi
    })
  }

  /**
   * 重置 New API Model Sync 配置
   */
  async resetNewApiModelSyncConfig(): Promise<boolean> {
    return this.savePreferences({
      newApiModelSync: DEFAULT_PREFERENCES.newApiModelSync
    })
  }

  /**
   * 重置自动签到配置
   */
  async resetAutoCheckinConfig(): Promise<boolean> {
    return this.savePreferences({
      autoCheckin: DEFAULT_PREFERENCES.autoCheckin
    })
  }

  /**
   * 重置模型重定向配置
   */
  async resetModelRedirectConfig(): Promise<boolean> {
    return this.savePreferences({
      modelRedirect: DEFAULT_PREFERENCES.modelRedirect
    })
  }

  /**
   * 重置 WebDAV 配置
   */
  async resetWebdavConfig(): Promise<boolean> {
    return this.savePreferences({
      webdav: DEFAULT_PREFERENCES.webdav
    })
  }

  /**
   * 重置主题和语言设置
   */
  async resetThemeAndLanguage(): Promise<boolean> {
    return this.savePreferences({
      themeMode: DEFAULT_PREFERENCES.themeMode,
      language: DEFAULT_PREFERENCES.language
    })
  }
}

// 创建单例实例
export const userPreferences = new UserPreferencesService()
