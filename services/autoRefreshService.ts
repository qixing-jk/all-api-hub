import { AccountAutoRefresh } from "~/types/accountAutoRefresh"

import { getErrorMessage } from "../utils/error"
import { accountStorage } from "./accountStorage"
import { userPreferences } from "./userPreferences"

/**
 * 自动刷新服务
 * 负责管理后台定时刷新功能
 */
class AutoRefreshService {
  private refreshTimer: NodeJS.Timeout | null = null
  private isInitialized = false

  /**
   * 初始化自动刷新服务
   */
  async initialize() {
    if (this.isInitialized) {
      console.log("[AutoRefresh] 服务已初始化")
      return
    }

    try {
      await this.setupAutoRefresh()
      this.isInitialized = true
      console.log("[AutoRefresh] 服务初始化成功")
    } catch (error) {
      console.error("[AutoRefresh] 服务初始化失败:", error)
    }
  }

  /**
   * 根据用户设置启动或停止自动刷新
   */
  async setupAutoRefresh() {
    try {
      // 清除现有定时器
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer)
        this.refreshTimer = null
        console.log("[AutoRefresh] 已清除现有定时器")
      }

      // 获取用户偏好设置
      const preferences = await userPreferences.getPreferences()

      if (!preferences.accountAutoRefresh?.enabled) {
        console.log("[AutoRefresh] 自动刷新已关闭")
        return
      }

      // 启动定时刷新
      const intervalMs = preferences.accountAutoRefresh.interval * 1000
      this.refreshTimer = setInterval(async () => {
        await this.performBackgroundRefresh()
      }, intervalMs)

      console.log(
        `[AutoRefresh] 自动刷新已启动，间隔: ${preferences.accountAutoRefresh.interval}秒`,
      )
    } catch (error) {
      console.error("[AutoRefresh] 设置自动刷新失败:", error)
    }
  }

  /**
   * 执行后台刷新
   */
  private async performBackgroundRefresh() {
    try {
      console.log("[AutoRefresh] 开始执行后台刷新")

      // 直接调用accountStorage的刷新方法
      const result = await accountStorage.refreshAllAccounts(false)
      console.log(
        `[AutoRefresh] 后台刷新完成 - 成功: ${result.success}, 失败: ${result.failed}`,
      )

      // 通知前端更新（如果popup是打开的）
      this.notifyFrontend("refresh_completed", result)
    } catch (error) {
      console.error("[AutoRefresh] 后台刷新失败:", error)
      this.notifyFrontend("refresh_error", { error: getErrorMessage(error) })
    }
  }

  /**
   * 立即执行一次刷新
   */
  async refreshNow(): Promise<{ success: number; failed: number }> {
    try {
      console.log("[AutoRefresh] 执行立即刷新")
      const result = await accountStorage.refreshAllAccounts(true)
      console.log(
        `[AutoRefresh] 立即刷新完成 - 成功: ${result.success}, 失败: ${result.failed}`,
      )
      return result
    } catch (error) {
      console.error("[AutoRefresh] 立即刷新失败:", error)
      throw error
    }
  }

  /**
   * 停止自动刷新
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
      console.log("[AutoRefresh] 自动刷新已停止")
    }
  }

  /**
   * 更新刷新设置
   */
  async updateSettings(updates: {
    accountAutoRefresh: Partial<AccountAutoRefresh>
  }) {
    try {
      await userPreferences.savePreferences(updates)
      // 重新设置定时器
      await this.setupAutoRefresh()
      console.log("[AutoRefresh] 设置已更新:", updates)
    } catch (error) {
      console.error("[AutoRefresh] 更新设置失败:", error)
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      isRunning: this.refreshTimer !== null,
      isInitialized: this.isInitialized,
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
          type: "AUTO_REFRESH_UPDATE",
          payload: { type, data },
        })
        .catch((error) => {
          // 静默处理"没有接收者"的错误（popup可能没打开）
          if (
            String(error?.message || "").includes(
              "receiving end does not exist",
            )
          ) {
            console.log("[AutoRefresh] 前端未打开，跳过通知")
          } else {
            console.warn("[AutoRefresh] 通知前端失败:", error)
          }
        })
    } catch (error) {
      console.error(error)
      // 静默处理错误，避免影响后台刷新
      console.warn("[AutoRefresh] 发送消息异常，可能前端未打开")
    }
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.stopAutoRefresh()
    this.isInitialized = false
    console.log("[AutoRefresh] 服务已销毁")
  }
}

// 创建单例实例
export const autoRefreshService = new AutoRefreshService()

// 消息处理器
export const handleAutoRefreshMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case "setupAutoRefresh":
        await autoRefreshService.setupAutoRefresh()
        sendResponse({ success: true })
        break

      case "refreshNow": {
        const result = await autoRefreshService.refreshNow()
        sendResponse({ success: true, data: result })
        break
      }

      case "stopAutoRefresh":
        autoRefreshService.stopAutoRefresh()
        sendResponse({ success: true })
        break

      case "updateAutoRefreshSettings":
        await autoRefreshService.updateSettings(request.settings)
        sendResponse({ success: true })
        break

      case "getAutoRefreshStatus": {
        const status = autoRefreshService.getStatus()
        sendResponse({ success: true, data: status })
        break
      }

      default:
        sendResponse({ success: false, error: "未知的操作" })
    }
  } catch (error) {
    console.error("[AutoRefresh] 处理消息失败:", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
