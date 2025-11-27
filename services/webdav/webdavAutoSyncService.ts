import { t } from "i18next"

import type { SiteAccount, WebDAVSettings } from "~/types"

import { BACKUP_VERSION } from "../../entrypoints/options/pages/ImportExport/utils.ts"
import { getErrorMessage } from "../../utils/error.ts"
import { accountStorage } from "../accountStorage.ts"
import { channelConfigStorage } from "../channelConfigStorage.ts"
import { userPreferences, type UserPreferences } from "../userPreferences.ts"
import {
  downloadBackup,
  testWebdavConnection,
  uploadBackup
} from "./webdavService.ts"

/**
 * WebDAV 自动同步服务
 * 负责管理后台定时同步功能
 */
class WebdavAutoSyncService {
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private isInitialized = false
  private isSyncing = false
  private lastSyncTime = 0
  private lastSyncStatus: "success" | "error" | "idle" = "idle"
  private lastSyncError: string | null = null

  /**
   * 初始化自动同步服务
   */
  async initialize() {
    if (this.isInitialized) {
      console.log("[WebdavAutoSync] 服务已初始化")
      return
    }

    try {
      await this.setupAutoSync()
      this.isInitialized = true
      console.log("[WebdavAutoSync] 服务初始化成功")
    } catch (error) {
      console.error("[WebdavAutoSync] 服务初始化失败:", error)
    }
  }

  /**
   * 根据用户设置启动或停止自动同步
   */
  async setupAutoSync() {
    try {
      // 清除现有定时器
      if (this.syncTimer) {
        clearInterval(this.syncTimer)
        this.syncTimer = null
        console.log("[WebdavAutoSync] 已清除现有定时器")
      }

      // 获取用户偏好设置
      const preferences = await userPreferences.getPreferences()

      if (!preferences.webdav.autoSync) {
        console.log("[WebdavAutoSync] 自动同步已关闭")
        return
      }

      // 检查WebDAV配置是否完整
      if (
        !preferences.webdav.url ||
        !preferences.webdav.username ||
        !preferences.webdav.password
      ) {
        console.log("[WebdavAutoSync] WebDAV配置不完整，无法启动自动同步")
        return
      }

      // 启动定时同步
      const intervalMs = (preferences.webdav.syncInterval || 3600) * 1000
      this.syncTimer = setInterval(async () => {
        await this.performBackgroundSync()
      }, intervalMs)

      console.log(
        `[WebdavAutoSync] 自动同步已启动，间隔: ${preferences.webdav.syncInterval || 3600}秒`
      )
    } catch (error) {
      console.error("[WebdavAutoSync] 设置自动同步失败:", error)
    }
  }

  /**
   * 执行后台同步
   */
  private async performBackgroundSync() {
    if (this.isSyncing) {
      console.log("[WebdavAutoSync] 同步正在进行中，跳过本次执行")
      return
    }

    this.isSyncing = true
    try {
      console.log("[WebdavAutoSync] 开始执行后台同步")

      await this.syncWithWebdav()

      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null

      console.log("[WebdavAutoSync] 后台同步完成")

      // 通知前端更新（如果popup是打开的）
      this.notifyFrontend("sync_completed", {
        timestamp: this.lastSyncTime
      })
    } catch (error) {
      console.error("[WebdavAutoSync] 后台同步失败:", error)
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      this.notifyFrontend("sync_error", { error: getErrorMessage(error) })
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 同步数据到WebDAV
   */
  async syncWithWebdav() {
    const preferences = await userPreferences.getPreferences()

    // 测试连接
    try {
      await testWebdavConnection()
    } catch (error) {
      console.error("[WebdavAutoSync] WebDAV连接失败:", error)
      throw new Error(t("messages:webdav.connectionFailed", { status: "N/A" }))
    }

    // 下载远程数据
    let remoteData: {
      version: string
      timestamp: number
      accounts?: { accounts: SiteAccount[]; last_updated: number }
      preferences?: UserPreferences
    } | null = null

    try {
      const content = await downloadBackup()
      remoteData = JSON.parse(content)
      console.log(
        "[WebdavAutoSync] 成功下载远程数据，时间戳:",
        remoteData?.timestamp
      )
    } catch (error: any) {
      if (error.message?.includes("404") || error.message?.includes("不存在")) {
        console.log("[WebdavAutoSync] 远程文件不存在，将创建新备份")
        remoteData = null
      } else {
        throw error
      }
    }

    // 获取本地数据
    const [localAccountsConfig, localPreferences, localChannelConfigs] =
      await Promise.all([
        accountStorage.exportData(),
        userPreferences.exportPreferences(),
        channelConfigStorage.exportConfigs()
      ])

    // 决定同步策略
    const strategy = preferences.webdav.syncStrategy || "merge"

    let accountsToSave: SiteAccount[]
    let preferencesToSave: UserPreferences

    if (strategy === "merge" && remoteData) {
      // 合并策略
      const mergeResult = this.mergeData(
        {
          accounts: localAccountsConfig.accounts,
          accountsTimestamp: localAccountsConfig.last_updated,
          preferences: localPreferences,
          preferencesTimestamp: localPreferences.lastUpdated
        },
        {
          accounts: remoteData.accounts?.accounts || [],
          accountsTimestamp: remoteData.accounts?.last_updated || 0,
          preferences: remoteData.preferences || localPreferences,
          preferencesTimestamp: remoteData.preferences?.lastUpdated || 0
        }
      )

      accountsToSave = mergeResult.accounts
      preferencesToSave = mergeResult.preferences
      console.log(`[WebdavAutoSync] 合并完成: ${accountsToSave.length} 个账号`)
    } else if (strategy === "upload_only" || !remoteData) {
      // 覆盖策略或远程无数据
      accountsToSave = localAccountsConfig.accounts
      preferencesToSave = localPreferences
      console.log("[WebdavAutoSync] 使用本地数据覆盖")
    } else {
      // 默认合并策略
      accountsToSave = remoteData?.accounts?.accounts || []
      preferencesToSave = remoteData?.preferences || localPreferences
      console.log("[WebdavAutoSync] 使用远程数据")
    }

    // 保存合并后的数据到本地
    await Promise.all([
      accountStorage.importData({ accounts: accountsToSave }),
      userPreferences.importPreferences(preferencesToSave)
    ])

    // 上传到WebDAV
    const exportData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: accountsToSave,
        last_updated: Date.now()
      },
      preferences: preferencesToSave,
      channelConfigs: localChannelConfigs
    }

    await uploadBackup(JSON.stringify(exportData, null, 2))
    console.log("[WebdavAutoSync] 数据已上传到WebDAV")
  }

  /**
   * 合并本地和远程数据
   * 基于时间戳，保留最新的数据
   */
  private mergeData(
    local: {
      accounts: SiteAccount[]
      accountsTimestamp: number
      preferences: UserPreferences
      preferencesTimestamp: number
    },
    remote: {
      accounts: SiteAccount[]
      accountsTimestamp: number
      preferences: UserPreferences
      preferencesTimestamp: number
    }
  ): {
    accounts: SiteAccount[]
    preferences: UserPreferences
  } {
    console.log(
      `[WebdavAutoSync] 开始合并数据 - 本地账号: ${local.accounts.length}, 远程账号: ${remote.accounts.length}`
    )

    // 合并账号数据
    const accountMap = new Map<string, SiteAccount>()

    // 首先添加本地账号
    local.accounts.forEach((account) => {
      accountMap.set(account.id, account)
    })

    // 然后处理远程账号
    remote.accounts.forEach((remoteAccount) => {
      const localAccount = accountMap.get(remoteAccount.id)

      if (!localAccount) {
        // 远程账号在本地不存在，直接添加
        accountMap.set(remoteAccount.id, remoteAccount)
        console.log(`[WebdavAutoSync] 添加远程账号: ${remoteAccount.site_name}`)
      } else {
        // 账号在两边都存在，比较时间戳
        const localUpdatedAt = localAccount.updated_at || 0
        const remoteUpdatedAt = remoteAccount.updated_at || 0

        if (remoteUpdatedAt > localUpdatedAt) {
          // 远程更新，使用远程数据
          accountMap.set(remoteAccount.id, remoteAccount)
          console.log(
            `[WebdavAutoSync] 使用远程账号: ${remoteAccount.site_name} (远程更新)`
          )
        } else {
          console.log(
            `[WebdavAutoSync] 保留本地账号: ${localAccount.site_name} (本地更新)`
          )
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

    console.log(
      `[WebdavAutoSync] 合并完成 - 总账号数: ${mergedAccounts.length}, 使用${
        remote.preferencesTimestamp > local.preferencesTimestamp
          ? "远程"
          : "本地"
      }偏好设置`
    )

    return {
      accounts: mergedAccounts,
      preferences
    }
  }

  /**
   * 立即执行一次同步
   */
  async syncNow(): Promise<{ success: boolean; message?: string }> {
    if (this.isSyncing) {
      return {
        success: false,
        message: "同步正在进行中，请稍后再试"
      }
    }

    try {
      console.log("[WebdavAutoSync] 执行立即同步")
      await this.syncWithWebdav()
      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null
      console.log("[WebdavAutoSync] 立即同步完成")
      return {
        success: true,
        message: "同步成功"
      }
    } catch (error) {
      console.error("[WebdavAutoSync] 立即同步失败:", error)
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      return {
        success: false,
        message: getErrorMessage(error)
      }
    }
  }

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
      console.log("[WebdavAutoSync] 自动同步已停止")
    }
  }

  /**
   * 更新同步设置
   */
  async updateSettings(settings: {
    autoSync?: boolean
    syncInterval?: number
    syncStrategy?: WebDAVSettings["syncStrategy"]
  }) {
    try {
      // Update the nested webdav object
      await userPreferences.savePreferences({
        webdav: settings
      })
      await this.setupAutoSync() // 重新设置定时器
      console.log("[WebdavAutoSync] 设置已更新:", settings)
    } catch (error) {
      console.error("[WebdavAutoSync] 更新设置失败:", error)
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      isRunning: this.syncTimer !== null,
      isInitialized: this.isInitialized,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError
    }
  }

  /**
   * 通知前端
   */
  private notifyFrontend(type: string, data: any) {
    try {
      // 向所有连接的客户端发送消息
      browser.runtime
        .sendMessage({
          type: "WEBDAV_AUTO_SYNC_UPDATE",
          payload: { type, data }
        })
        .catch((error) => {
          // 静默处理"没有接收者"的错误（popup可能没打开）
          if (
            String(error?.message || "").includes(
              "receiving end does not exist"
            )
          ) {
            console.log("[WebdavAutoSync] 前端未打开，跳过通知")
          } else {
            console.warn("[WebdavAutoSync] 通知前端失败:", error)
          }
        })
    } catch (error) {
      // 静默处理错误，避免影响后台同步
      console.error(error)
      console.warn("[WebdavAutoSync] 发送消息异常，可能前端未打开")
    }
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.stopAutoSync()
    this.isInitialized = false
    console.log("[WebdavAutoSync] 服务已销毁")
  }
}

// 创建单例实例
export const webdavAutoSyncService = new WebdavAutoSyncService()

// 消息处理器
export const handleWebdavAutoSyncMessage = async (
  request: any,
  sendResponse: (response: any) => void
) => {
  try {
    switch (request.action) {
      case "webdavAutoSync:setup":
        await webdavAutoSyncService.setupAutoSync()
        sendResponse({ success: true })
        break

      case "webdavAutoSync:syncNow": {
        const result = await webdavAutoSyncService.syncNow()
        sendResponse({ success: result.success, message: result.message })
        break
      }

      case "webdavAutoSync:stop":
        webdavAutoSyncService.stopAutoSync()
        sendResponse({ success: true })
        break

      case "webdavAutoSync:updateSettings": {
        await webdavAutoSyncService.updateSettings(request.settings)
        sendResponse({ success: true })
        break
      }

      case "webdavAutoSync:getStatus": {
        const status = webdavAutoSyncService.getStatus()
        sendResponse({ success: true, data: status })
        break
      }

      default:
        sendResponse({ success: false, error: "未知的操作" })
    }
  } catch (error) {
    console.error("[WebdavAutoSync] 处理消息失败:", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
