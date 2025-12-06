import { AccountAutoRefresh } from "~/types/accountAutoRefresh"

import { getErrorMessage } from "../utils/error"
import { accountStorage } from "./accountStorage"
import { userPreferences } from "./userPreferences"

/**
 * Manages account auto-refresh in the background.
 * Responsibilities:
 * - Reads user preferences to decide whether and how often to refresh.
 * - Maintains a single interval timer to avoid duplicate refresh jobs.
 * - Broadcasts status/results to any connected frontends (popup/options).
 */
class AutoRefreshService {
  private refreshTimer: NodeJS.Timeout | null = null
  private isInitialized = false

  /**
   * Initialize auto refresh (idempotent).
   * Loads preferences and starts the timer if enabled.
   *
   * Safe to call repeatedly; returns early when already initialized.
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
   * Start or stop the interval based on current user preferences.
   * Always clears any existing timer to prevent duplicate schedules.
   *
   * Respects accountAutoRefresh.enabled/interval from user preferences.
   */
  async setupAutoRefresh() {
    try {
      // 清除现有定时器
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer)
        this.refreshTimer = null
        console.log("[AutoRefresh] 已清除现有定时器")
      }

      // 获取用户偏好设置（可能关闭自动刷新）
      const preferences = await userPreferences.getPreferences()

      if (!preferences.accountAutoRefresh?.enabled) {
        console.log("[AutoRefresh] 自动刷新已关闭")
        return
      }

      // 启动定时刷新；使用 setInterval 保存引用以便后续清理
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
   * Execute a background refresh cycle.
   * Catches errors and notifies frontend listeners.
   *
   * Uses accountStorage.refreshAllAccounts with silent mode (no toast).
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
   * Trigger a one-off immediate refresh (bypasses interval scheduling).
   * @returns Counts of succeeded/failed account refreshes.
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
   * Stop the interval timer if running.
   *
   * Idempotent; safe to call when not running.
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
      console.log("[AutoRefresh] 自动刷新已停止")
    }
  }

  /**
   * Persist new refresh settings and reconfigure the timer accordingly.
   * @param updates Settings payload containing preference updates.
   * @param updates.accountAutoRefresh Partial accountAutoRefresh config to merge.
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
   * Get current runtime status (used by UI to display state).
   * @returns Whether timer is running and service initialized.
   */
  getStatus() {
    return {
      isRunning: this.refreshTimer !== null,
      isInitialized: this.isInitialized,
    }
  }

  /**
   * Notify any connected frontend about refresh state changes.
   * Swallows "receiving end does not exist" errors because popup may be closed.
   *
   * Best-effort; errors are logged without throwing to avoid breaking background flow.
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

/**
 * Message handler for auto-refresh related actions.
 * Keeps background-only logic centralized; responds with success/error payloads.
 * @param request Incoming message with action and payload.
 * @param sendResponse Callback to reply to sender.
 */
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
