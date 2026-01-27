import { t } from "i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  BACKUP_VERSION,
  normalizeBackupForMerge,
  type BackupFullV2,
} from "~/entrypoints/options/pages/ImportExport/utils"
import { tagStorage } from "~/services/accountTags/tagStorage"
import {
  createDefaultTagStore,
  sanitizeTagStore,
} from "~/services/accountTags/tagStoreUtils"
import { migrateAccountTagsData } from "~/services/configMigration/accountTags/accountTagsDataMigration"
import type { SiteAccount, TagStore } from "~/types"
import type { ChannelConfigMap } from "~/types/channelConfig"
import { WEBDAV_SYNC_STRATEGIES, WebDAVSettings } from "~/types/webdav"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

import { accountStorage } from "../accountStorage"
import { channelConfigStorage } from "../channelConfigStorage"
import { userPreferences, type UserPreferences } from "../userPreferences"
import {
  downloadBackup,
  testWebdavConnection,
  uploadBackup,
} from "./webdavService"

const logger = createLogger("WebdavAutoSync")

/**
 * Manages WebDAV auto-sync in the background.
 * Responsibilities:
 * - Reads WebDAV preferences to decide if/when to sync.
 * - Maintains a single interval timer with an isSyncing guard to avoid overlap.
 * - Merges or uploads backups according to user-selected strategy.
 * - Notifies frontends about sync status/results.
 */
class WebdavAutoSyncService {
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private isInitialized = false
  private isSyncing = false
  private lastSyncTime = 0
  private lastSyncStatus: "success" | "error" | "idle" = "idle"
  private lastSyncError: string | null = null

  /**
   * Initialize auto-sync (idempotent).
   * Loads preferences and starts timer when enabled.
   *
   * Safe to call multiple times; returns early if already initialized.
   */
  async initialize() {
    if (this.isInitialized) {
      logger.debug("服务已初始化")
      return
    }

    try {
      await this.setupAutoSync()
      this.isInitialized = true
      logger.info("服务初始化成功")
    } catch (error) {
      logger.error("服务初始化失败", error)
    }
  }

  /**
   * Start or stop auto-sync based on current preferences.
   * Always clears existing timer to prevent duplicate schedules.
   *
   * Reads WebDAV creds and interval from user preferences; skips when config
   * is incomplete or disabled.
   */
  async setupAutoSync() {
    try {
      // 清除现有定时器，避免重复的并发任务
      if (this.syncTimer) {
        clearInterval(this.syncTimer)
        this.syncTimer = null
        logger.debug("已清除现有定时器")
      }

      // 获取用户偏好设置
      const preferences = await userPreferences.getPreferences()

      if (!preferences.webdav.autoSync) {
        logger.info("自动同步已关闭")
        return
      }

      // 检查WebDAV配置是否完整；缺失凭据时跳过自动同步
      if (
        !preferences.webdav.url ||
        !preferences.webdav.username ||
        !preferences.webdav.password
      ) {
        logger.warn("WebDAV配置不完整，无法启动自动同步")
        return
      }

      // 启动定时同步；保存定时器引用以便后续清理
      const intervalMs = (preferences.webdav.syncInterval || 3600) * 1000
      this.syncTimer = setInterval(async () => {
        await this.performBackgroundSync()
      }, intervalMs)

      logger.info("自动同步已启动", {
        intervalSeconds: preferences.webdav.syncInterval || 3600,
      })
    } catch (error) {
      logger.error("设置自动同步失败", error)
    }
  }

  /**
   * Execute a background sync run.
   * Uses isSyncing flag to skip overlapping executions.
   *
   * Updates lastSyncTime/status and notifies frontend listeners.
   */
  private async performBackgroundSync() {
    if (this.isSyncing) {
      logger.debug("同步正在进行中，跳过本次执行")
      return
    }

    this.isSyncing = true
    try {
      logger.info("开始执行后台同步")

      await this.syncWithWebdav()

      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null

      logger.info("后台同步完成")

      // 通知前端更新（如果popup是打开的）
      this.notifyFrontend("sync_completed", {
        timestamp: this.lastSyncTime,
      })
    } catch (error) {
      logger.error("后台同步失败", error)
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      this.notifyFrontend("sync_error", { error: getErrorMessage(error) })
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 同步数据到WebDAV。
   *
   * 流程：
   * 1. 使用当前用户 WebDAV 配置测试连接。
   * 2. 从远程下载备份并通过 normalizeBackupForMerge 按版本规范化
   *    （兼容 V1 旧结构和当前 V2 扁平结构，未来版本可扩展）。
   *    - 如果远程备份是加密封套（envelope），downloadBackup 会尝试用
   *      当前 WebDAV 加密密码自动解密；缺失/错误密码会导致本次同步失败。
   * 3. 根据 syncStrategy 决定合并方式：
   *    - "merge": 调用 mergeData 基于时间戳双向合并本地 / 远程账号与偏好设置。
   *    - "upload_only" 或远程无数据：使用本地数据覆盖远程。
   *    - 默认：优先使用远程数据，否则回退到本地。
   * 4. 将合并后的账号和偏好设置写回本地存储，并上传新的备份（始终使用
   *    BACKUP_VERSION 与扁平结构，包含 channelConfigs 快照）。
   *    - uploadBackup 会根据当前 WebDAV 加密开关决定是否将备份加密后上传。
   *
   * Throws when connection fails or merge/upload errors occur.
   */
  async syncWithWebdav() {
    const preferences = await userPreferences.getPreferences()

    // 测试连接
    try {
      await testWebdavConnection()
    } catch (error) {
      logger.error("WebDAV连接失败", error)
      throw new Error(t("messages:webdav.connectionFailed", { status: "N/A" }))
    }

    // 下载远程数据
    let remoteData: any | null = null

    try {
      const content = await downloadBackup()
      remoteData = JSON.parse(content)
      logger.info("成功下载远程数据", { timestamp: remoteData?.timestamp })
    } catch (error: any) {
      if (error.message?.includes("404") || error.message?.includes("不存在")) {
        logger.info("远程文件不存在，将创建新备份")
        remoteData = null
      } else {
        throw error
      }
    }

    // 获取本地数据（`accountStorage.exportData()` will ensure legacy tags are migrated）
    const [
      localAccountsConfig,
      localTagStore,
      localPreferences,
      localChannelConfigs,
    ] = await Promise.all([
      accountStorage.exportData(),
      tagStorage.exportTagStore(),
      userPreferences.exportPreferences(),
      channelConfigStorage.exportConfigs(),
    ])

    const localPinnedAccountIds = localAccountsConfig.pinnedAccountIds || []

    let remotePinnedAccountIds: string[] = []

    if (remoteData && remoteData.version === BACKUP_VERSION) {
      const remoteAccountsField = (remoteData as BackupFullV2).accounts as any
      if (
        remoteAccountsField &&
        Array.isArray(remoteAccountsField.pinnedAccountIds)
      ) {
        remotePinnedAccountIds = remoteAccountsField.pinnedAccountIds
      }
    }

    const normalizedRemote = normalizeBackupForMerge(
      remoteData,
      localPreferences,
    )

    // 决定同步策略
    const strategy =
      preferences.webdav.syncStrategy || WEBDAV_SYNC_STRATEGIES.MERGE

    let accountsToSave: SiteAccount[] = localAccountsConfig.accounts
    let tagStoreToSave = localTagStore
    let preferencesToSave: UserPreferences = localPreferences
    let channelConfigsToSave: ChannelConfigMap = localChannelConfigs
    let pinnedAccountIdsToSave: string[] = localPinnedAccountIds

    if (strategy === WEBDAV_SYNC_STRATEGIES.MERGE && remoteData) {
      // 合并策略
      const mergeResult = this.mergeData(
        {
          accounts: localAccountsConfig.accounts,
          accountsTimestamp: localAccountsConfig.last_updated,
          tagStore: localTagStore,
          preferences: localPreferences,
          preferencesTimestamp: localPreferences.lastUpdated,
          channelConfigs: localChannelConfigs,
        },
        {
          accounts: normalizedRemote.accounts,
          accountsTimestamp: normalizedRemote.accountsTimestamp,
          tagStore: sanitizeTagStore(
            normalizedRemote.tagStore ?? createDefaultTagStore(),
          ),
          preferences: normalizedRemote.preferences || localPreferences,
          preferencesTimestamp:
            (normalizedRemote.preferences &&
              normalizedRemote.preferences.lastUpdated) ||
            0,
          channelConfigs: normalizedRemote.channelConfigs,
        },
      )

      accountsToSave = mergeResult.accounts
      tagStoreToSave = mergeResult.tagStore
      preferencesToSave = mergeResult.preferences
      channelConfigsToSave = mergeResult.channelConfigs

      const mergedPinnedIds = [
        ...remotePinnedAccountIds,
        ...localPinnedAccountIds,
      ]
      const seenPinned = new Set<string>()
      const uniqueMergedPinnedIds: string[] = []
      for (const id of mergedPinnedIds) {
        if (!seenPinned.has(id)) {
          seenPinned.add(id)
          uniqueMergedPinnedIds.push(id)
        }
      }
      pinnedAccountIdsToSave = uniqueMergedPinnedIds.filter((id) =>
        accountsToSave.some((account) => account.id === id),
      )
      logger.info("合并完成", { accountCount: accountsToSave.length })
    } else if (strategy === WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY || !remoteData) {
      // 覆盖策略或远程无数据
      accountsToSave = localAccountsConfig.accounts
      tagStoreToSave = localTagStore
      preferencesToSave = localPreferences
      channelConfigsToSave = localChannelConfigs
      pinnedAccountIdsToSave = localPinnedAccountIds.filter((id) =>
        accountsToSave.some((account) => account.id === id),
      )
      logger.info("使用本地数据覆盖")
    } else if (strategy === WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY) {
      // 远程优先策略：直接使用远程数据（若存在），否则使用本地
      const remoteStore = sanitizeTagStore(
        normalizedRemote.tagStore ?? createDefaultTagStore(),
      )
      const migratedRemote = migrateAccountTagsData({
        accounts: normalizedRemote.accounts as SiteAccount[],
        tagStore: remoteStore,
      })
      accountsToSave = migratedRemote.accounts
      tagStoreToSave = migratedRemote.tagStore
      preferencesToSave = normalizedRemote.preferences || localPreferences
      channelConfigsToSave =
        normalizedRemote.channelConfigs || localChannelConfigs
      pinnedAccountIdsToSave = remotePinnedAccountIds.filter((id) =>
        accountsToSave.some((account) => account.id === id),
      )
      logger.info("使用远程数据")
    } else {
      logger.error("无效的同步策略，将中止本次同步", {
        strategy: String(strategy),
      })
      throw new Error(`Invalid WebDAV sync strategy: ${String(strategy)}`)
    }

    // 保存合并后的数据到本地
    await Promise.all([
      accountStorage.importData({
        accounts: accountsToSave,
        pinnedAccountIds: pinnedAccountIdsToSave,
      }),
      tagStorage.importTagStore(tagStoreToSave),
      userPreferences.importPreferences(preferencesToSave, {
        preserveWebdav: true,
      }),
      channelConfigStorage.importConfigs(channelConfigsToSave),
    ])

    // 上传到WebDAV
    const exportData: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: accountsToSave,
        pinnedAccountIds: pinnedAccountIdsToSave,
        last_updated: Date.now(),
      },
      tagStore: tagStoreToSave,
      preferences: preferencesToSave,
      channelConfigs: channelConfigsToSave,
    }

    await uploadBackup(JSON.stringify(exportData, null, 2))
    logger.info("数据已上传到WebDAV")
  }

  /**
   * Merge local and remote data based on timestamps (latest wins).
   * Also reconciles channel configs and deduplicates pinned ids.
   * @returns Merged accounts, preferences, and channel configs.
   */
  private mergeData(
    local: {
      accounts: SiteAccount[]
      accountsTimestamp: number
      tagStore: TagStore
      preferences: UserPreferences
      preferencesTimestamp: number
      channelConfigs: ChannelConfigMap
    },
    remote: {
      accounts: SiteAccount[]
      accountsTimestamp: number
      tagStore: TagStore
      preferences: UserPreferences
      preferencesTimestamp: number
      channelConfigs: ChannelConfigMap | null
    },
  ): {
    accounts: SiteAccount[]
    tagStore: TagStore
    preferences: UserPreferences
    channelConfigs: ChannelConfigMap
  } {
    logger.debug("开始合并数据", {
      localAccountCount: local.accounts.length,
      remoteAccountCount: remote.accounts.length,
    })

    // Migrate legacy string tags (if any) into tag ids on both sides.
    const localTagStore = sanitizeTagStore(
      local.tagStore ?? createDefaultTagStore(),
    )
    const remoteTagStore = sanitizeTagStore(
      remote.tagStore ?? createDefaultTagStore(),
    )
    const migratedLocal = migrateAccountTagsData({
      accounts: local.accounts,
      tagStore: localTagStore,
    })
    const migratedRemote = migrateAccountTagsData({
      accounts: remote.accounts,
      tagStore: remoteTagStore,
    })

    // Merge tag stores and remap accounts so tag ids always resolve.
    const tagMerge = tagStorage.mergeTagStoresForSync({
      localTagStore: migratedLocal.tagStore,
      remoteTagStore: migratedRemote.tagStore,
      localAccounts: migratedLocal.accounts,
      remoteAccounts: migratedRemote.accounts,
    })

    // 合并账号数据
    const accountMap = new Map<string, SiteAccount>()

    // 首先添加本地账号
    tagMerge.localAccounts.forEach((account) => {
      accountMap.set(account.id, account)
    })

    // 然后处理远程账号（按 updated_at 选择较新版本）
    tagMerge.remoteAccounts.forEach((remoteAccount) => {
      const localAccount = accountMap.get(remoteAccount.id)

      if (!localAccount) {
        // 远程账号在本地不存在，直接添加
        accountMap.set(remoteAccount.id, remoteAccount)
        logger.debug("添加远程账号", {
          accountId: remoteAccount.id,
          siteName: remoteAccount.site_name,
        })
      } else {
        // 账号在两边都存在，比较时间戳
        const localUpdatedAt = localAccount.updated_at || 0
        const remoteUpdatedAt = remoteAccount.updated_at || 0

        if (remoteUpdatedAt > localUpdatedAt) {
          // 远程更新，使用远程数据
          accountMap.set(remoteAccount.id, remoteAccount)
          logger.debug("使用远程账号（远程更新）", {
            accountId: remoteAccount.id,
            siteName: remoteAccount.site_name,
          })
        } else {
          logger.debug("保留本地账号（本地更新）", {
            accountId: localAccount.id,
            siteName: localAccount.site_name,
          })
        }
      }
    })

    const mergedAccounts = Array.from(accountMap.values())

    // 合并偏好设置
    // 比较lastUpdated字段，保留最新的
    const preferences =
      remote.preferencesTimestamp > local.preferencesTimestamp
        ? remote.preferences
        : local.preferences

    // 合并通道配置
    const localChannelConfigs = local.channelConfigs
    const remoteChannelConfigs = remote.channelConfigs
    const mergedChannelConfigs: ChannelConfigMap = { ...localChannelConfigs }

    if (remoteChannelConfigs && typeof remoteChannelConfigs === "object") {
      for (const [key, value] of Object.entries(remoteChannelConfigs)) {
        const channelId = Number(key)
        if (!Number.isFinite(channelId) || channelId <= 0) {
          continue
        }

        const localConfig = localChannelConfigs[channelId]
        const remoteConfig = value as ChannelConfigMap[number]

        if (!localConfig) {
          mergedChannelConfigs[channelId] = remoteConfig
        } else {
          const localUpdatedAt =
            typeof localConfig.updatedAt === "number"
              ? localConfig.updatedAt
              : 0
          const remoteUpdatedAt =
            typeof remoteConfig.updatedAt === "number"
              ? remoteConfig.updatedAt
              : 0

          mergedChannelConfigs[channelId] =
            remoteUpdatedAt > localUpdatedAt ? remoteConfig : localConfig
        }
      }
    }

    logger.info("合并完成", {
      accountCount: mergedAccounts.length,
      preferencesSource:
        remote.preferencesTimestamp > local.preferencesTimestamp
          ? "remote"
          : "local",
      channelConfigCount: Object.keys(mergedChannelConfigs).length,
    })

    return {
      accounts: mergedAccounts,
      tagStore: tagMerge.tagStore,
      preferences,
      channelConfigs: mergedChannelConfigs,
    }
  }

  /**
   * 立即执行一次同步
   * @returns Result with success flag and optional message.
   */
  async syncNow(): Promise<{ success: boolean; message?: string }> {
    if (this.isSyncing) {
      return {
        success: false,
        message: "同步正在进行中，请稍后再试",
      }
    }

    try {
      logger.info("执行立即同步")
      await this.syncWithWebdav()
      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null
      logger.info("立即同步完成")
      return {
        success: true,
        message: "同步成功",
      }
    } catch (error) {
      logger.error("立即同步失败", error)
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      return {
        success: false,
        message: getErrorMessage(error),
      }
    }
  }

  /**
   * 停止自动同步
   *
   * Clears any active interval timer; idempotent.
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
      logger.info("自动同步已停止")
    }
  }

  /**
   * 更新同步设置
   *
   * Persists partial webdav settings and reconfigures scheduler.
   */
  async updateSettings(settings: {
    autoSync?: boolean
    syncInterval?: number
    syncStrategy?: WebDAVSettings["syncStrategy"]
  }) {
    try {
      // Update the nested webdav object
      await userPreferences.savePreferences({
        webdav: settings,
      })
      await this.setupAutoSync() // 重新设置定时器
      logger.info("设置已更新", settings)
    } catch (error) {
      logger.error("更新设置失败", error)
    }
  }

  /**
   * 获取当前状态
   * @returns Snapshot of initialization, running, and last-sync info.
   */
  getStatus() {
    return {
      isRunning: this.syncTimer !== null,
      isInitialized: this.isInitialized,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError,
    }
  }

  /**
   * Notify frontends about sync status updates.
   * Silently ignores missing receivers (popup/options may be closed).
   *
   * Best-effort; errors are logged and swallowed to avoid breaking sync loop.
   */
  private notifyFrontend(type: string, data: any) {
    try {
      // 向所有连接的客户端发送消息
      browser.runtime
        .sendMessage({
          type: "WEBDAV_AUTO_SYNC_UPDATE",
          payload: { type, data },
        })
        .catch((error) => {
          // 静默处理"没有接收者"的错误（popup可能没打开）
          if (
            String(error?.message || "").includes(
              "receiving end does not exist",
            )
          ) {
            logger.debug("前端未打开，跳过通知")
          } else {
            logger.warn("通知前端失败", error)
          }
        })
    } catch (error) {
      // 静默处理错误，避免影响后台同步
      logger.warn("发送消息异常，可能前端未打开", error)
    }
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.stopAutoSync()
    this.isInitialized = false
    logger.info("服务已销毁")
  }
}

// 创建单例实例
export const webdavAutoSyncService = new WebdavAutoSyncService()

/**
 * Message handler for WebDAV auto-sync actions (setup, syncNow, stop, update).
 * @param request Incoming message with action + payload.
 * @param sendResponse Callback to respond to sender.
 */
export const handleWebdavAutoSyncMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.WebdavAutoSyncSetup:
        await webdavAutoSyncService.setupAutoSync()
        sendResponse({ success: true })
        break

      case RuntimeActionIds.WebdavAutoSyncSyncNow: {
        const result = await webdavAutoSyncService.syncNow()
        sendResponse({ success: result.success, message: result.message })
        break
      }

      case RuntimeActionIds.WebdavAutoSyncStop:
        webdavAutoSyncService.stopAutoSync()
        sendResponse({ success: true })
        break

      case RuntimeActionIds.WebdavAutoSyncUpdateSettings: {
        await webdavAutoSyncService.updateSettings(request.settings)
        sendResponse({ success: true })
        break
      }

      case RuntimeActionIds.WebdavAutoSyncGetStatus: {
        const status = webdavAutoSyncService.getStatus()
        sendResponse({ success: true, data: status })
        break
      }

      default:
        sendResponse({ success: false, error: "未知的操作" })
    }
  } catch (error) {
    logger.error("处理消息失败", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
