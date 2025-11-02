import { Storage } from "@plasmohq/storage"

import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import {
  CURRENT_PREFERENCES_VERSION,
  migratePreferences
} from "~/services/configMigration/preferencesMigration"
import type { BalanceType, CurrencyType, SortField, SortOrder } from "~/types"
import type { AutoCheckinPreferences } from "~/types/autoCheckin"
import type { ModelRedirectSettings } from "~/types/modelRedirect"
import type { SortingPriorityConfig } from "~/types/sorting"
import type { ThemeMode } from "~/types/theme"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

// 用户偏好设置类型定义
export interface UserPreferences {
  // BalanceSection 相关配置
  activeTab: BalanceType // 金额标签页状态
  currencyType: CurrencyType // 金额单位

  // AccountList 相关配置
  sortField: SortField // 排序字段
  sortOrder: SortOrder // 排序顺序

  // 自动刷新相关配置
  autoRefresh: boolean // 是否启用定时自动刷新
  refreshInterval: number // 刷新间隔（秒）
  minRefreshInterval: number // 最小刷新间隔（秒）
  refreshOnOpen: boolean // 打开插件时自动刷新
  showHealthStatus: boolean // 是否显示健康状态

  // WebDAV 备份/同步配置
  webdavUrl: string // 远程备份文件完整URL（例如：https://dav.example.com/backups/all-api-hub.json）
  webdavUsername: string // 用户名
  webdavPassword: string // 密码
  webdavAutoSync: boolean // 是否启用自动同步
  webdavSyncInterval: number // 同步间隔（秒）
  webdavSyncStrategy: "merge" | "upload_only" | "download_only" // 同步策略

  // 其他配置可在此扩展
  lastUpdated: number // 最后更新时间

  // New API 相关配置
  newApiBaseUrl?: string
  newApiAdminToken?: string
  newApiUserId?: string

  // New API Model Sync 配置
  newApiModelSync?: {
    enabled: boolean
    interval: number // 同步间隔（毫秒）
    concurrency: number // 并发数量（单通道并发任务数）
    maxRetries: number // 最大重试次数
    rateLimit: {
      requestsPerMinute: number // 每分钟请求次数限制
      burst: number // 瞬时突发请求数
    }
  }

  modelRedirect?: ModelRedirectSettings

  sortingPriorityConfig?: SortingPriorityConfig
  themeMode: ThemeMode
  language?: string // Added language preference

  // Auto Check-in 配置
  autoCheckin?: AutoCheckinPreferences

  // Configuration version for migration tracking
  preferencesVersion?: number
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
  autoRefresh: true, // 默认启用自动刷新
  refreshInterval: 360, // 默认360秒刷新间隔
  minRefreshInterval: 60, // 默认60秒最小刷新间隔
  refreshOnOpen: true, // 默认打开插件时自动刷新
  showHealthStatus: true, // 默认显示健康状态
  webdavUrl: "",
  webdavUsername: "",
  webdavPassword: "",
  webdavAutoSync: false,
  webdavSyncInterval: 3600,
  webdavSyncStrategy: "merge",
  lastUpdated: Date.now(),
  newApiBaseUrl: "",
  newApiAdminToken: "",
  newApiUserId: "",
  newApiModelSync: {
    enabled: false,
    interval: 24 * 60 * 60 * 1000, // 24小时
    concurrency: 2, // 降低并发数，避免触发速率限制
    maxRetries: 2,
    rateLimit: {
      requestsPerMinute: 20, // 每分钟20个请求
      burst: 5 // 允许5个突发请求
    }
  },
  modelRedirect: {
    enabled: false,
    standardModels: [],
    autoGenerateMapping: true,
    mappings: []
  },
  autoCheckin: {
    globalEnabled: false,
    windowStart: "09:00",
    windowEnd: "18:00"
  },
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

      // If migration changed preferences, save the updated version
      if (migratedPreferences !== storedPreferences) {
        await this.storage.set(
          STORAGE_KEYS.USER_PREFERENCES,
          migratedPreferences
        )
      }

      return migratedPreferences
    } catch (error) {
      console.error("获取用户偏好设置失败:", error)
      return DEFAULT_PREFERENCES
    }
  }

  /**
   * 保存用户偏好设置
   */
  async savePreferences(
    preferences: Partial<UserPreferences>
  ): Promise<boolean> {
    try {
      const currentPreferences = await this.getPreferences()
      const {
        newApiModelSync: newSyncConfig,
        autoCheckin: autoCheckinConfig,
        modelRedirect: modelRedirectConfig,
        ...rest
      } = preferences

      const mergedModelRedirect = modelRedirectConfig
        ? {
            ...(currentPreferences.modelRedirect ??
              DEFAULT_PREFERENCES.modelRedirect!),
            ...modelRedirectConfig,
            standardModels:
              modelRedirectConfig.standardModels !== undefined
                ? modelRedirectConfig.standardModels
                : currentPreferences.modelRedirect?.standardModels ??
                  DEFAULT_PREFERENCES.modelRedirect!.standardModels,
            mappings:
              modelRedirectConfig.mappings !== undefined
                ? modelRedirectConfig.mappings
                : currentPreferences.modelRedirect?.mappings ??
                  DEFAULT_PREFERENCES.modelRedirect!.mappings
          }
        : currentPreferences.modelRedirect ?? DEFAULT_PREFERENCES.modelRedirect!

      const updatedPreferences: UserPreferences = {
        ...currentPreferences,
        ...rest,
        newApiModelSync: newSyncConfig
          ? {
              ...(currentPreferences.newApiModelSync ??
                DEFAULT_PREFERENCES.newApiModelSync!),
              ...newSyncConfig
            }
          : currentPreferences.newApiModelSync,
        autoCheckin: autoCheckinConfig
          ? {
              ...(currentPreferences.autoCheckin ??
                DEFAULT_PREFERENCES.autoCheckin!),
              ...autoCheckinConfig
            }
          : currentPreferences.autoCheckin,
        modelRedirect: mergedModelRedirect,
        lastUpdated: Date.now(),
        preferencesVersion: CURRENT_PREFERENCES_VERSION
      }

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
   * 更新自动刷新设置
   */
  async updateAutoRefreshSettings(settings: {
    autoRefresh?: boolean
    refreshInterval?: number
    refreshOnOpen?: boolean
    showHealthStatus?: boolean
  }): Promise<boolean> {
    return this.savePreferences(settings)
  }

  /**
   * 更新自动刷新开关
   */
  async updateAutoRefresh(autoRefresh: boolean): Promise<boolean> {
    return this.savePreferences({ autoRefresh })
  }

  /**
   * 更新刷新间隔
   */
  async updateRefreshInterval(refreshInterval: number): Promise<boolean> {
    return this.savePreferences({ refreshInterval })
  }

  /**
   * 更新最小刷新间隔
   */
  async updateMinRefreshInterval(minRefreshInterval: number): Promise<boolean> {
    return this.savePreferences({ minRefreshInterval })
  }

  /**
   * 更新打开插件时自动刷新设置
   */
  async updateRefreshOnOpen(refreshOnOpen: boolean): Promise<boolean> {
    return this.savePreferences({ refreshOnOpen })
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
    webdavUrl?: string
    webdavUsername?: string
    webdavPassword?: string
  }): Promise<boolean> {
    return this.savePreferences(settings)
  }

  /**
   * 更新 WebDAV 自动同步设置
   */
  async updateWebdavAutoSyncSettings(settings: {
    webdavAutoSync?: boolean
    webdavSyncInterval?: number
    webdavSyncStrategy?: "merge" | "upload_only" | "download_only"
  }): Promise<boolean> {
    return this.savePreferences(settings)
  }

  /**
   * 更新 New API 设置
   */
  async updateNewApiSettings(settings: {
    newApiBaseUrl?: string
    newApiAdminToken?: string
    newApiUserId?: string
  }): Promise<boolean> {
    return this.savePreferences(settings)
  }

  async updateNewApiBaseUrl(newApiBaseUrl: string): Promise<boolean> {
    return this.savePreferences({ newApiBaseUrl })
  }

  async updateNewApiAdminToken(newApiAdminToken: string): Promise<boolean> {
    return this.savePreferences({ newApiAdminToken })
  }

  async updateNewApiUserId(newApiUserId: string): Promise<boolean> {
    return this.savePreferences({ newApiUserId })
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

  async getModelRedirectSettings(): Promise<ModelRedirectSettings> {
    const preferences = await this.getPreferences()
    return (
      preferences.modelRedirect ?? DEFAULT_PREFERENCES.modelRedirect!
    )
  }

  async updateModelRedirectSettings(
    updates: Partial<ModelRedirectSettings>
  ): Promise<boolean> {
    const preferences = await this.getPreferences()
    const baseSettings =
      preferences.modelRedirect ?? DEFAULT_PREFERENCES.modelRedirect!

    const nextSettings: ModelRedirectSettings = {
      ...baseSettings,
      ...updates,
      standardModels:
        updates.standardModels !== undefined
          ? updates.standardModels
          : baseSettings.standardModels,
      mappings:
        updates.mappings !== undefined ? updates.mappings : baseSettings.mappings
    }

    return this.savePreferences({ modelRedirect: nextSettings })
  }
}

// 创建单例实例
export const userPreferences = new UserPreferencesService()
