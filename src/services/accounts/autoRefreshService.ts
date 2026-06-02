import {
  AutoRefreshMessageTypes,
  onAutoRefreshMessage,
  type AutoRefreshMutationResponse,
  type AutoRefreshRefreshNowResponse,
  type AutoRefreshStatusResponse,
  type AutoRefreshUpdateSettingsRequest,
} from "~/services/accounts/autoRefreshMessaging"
import { usageHistoryScheduler } from "~/services/history/usageHistory/scheduler"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import { AccountAutoRefresh } from "~/types/accountAutoRefresh"
import {
  isMessageReceiverUnavailableError,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { userPreferences } from "../preferences/userPreferences"
import { accountStorage } from "./accountStorage"

const logger = createLogger("AutoRefresh")

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
      logger.debug("服务已初始化")
      return
    }

    try {
      await this.setupAutoRefresh()
      this.isInitialized = true
      logger.info("服务初始化成功")
    } catch (error) {
      logger.error("服务初始化失败", error)
    }
  }

  /**
   * Start or stop the interval based on current user preferences.
   * Always clears any existing timer to prevent duplicate schedules.
   *
   * Respects accountAutoRefresh.enabled/interval from user preferences.
   */
  async setupAutoRefresh() {
    // 获取用户偏好设置（可能关闭自动刷新）
    const preferences = await userPreferences.getPreferences()

    const nextConfig = preferences.accountAutoRefresh
    if (nextConfig?.enabled) {
      const intervalSeconds = Number(nextConfig.interval)
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        throw new Error("Invalid auto-refresh interval")
      }
    }

    // 清除现有定时器
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
      logger.debug("已清除现有定时器")
    }

    if (!preferences.accountAutoRefresh?.enabled) {
      logger.info("自动刷新已关闭")
      return
    }

    // 启动定时刷新；使用 setInterval 保存引用以便后续清理
    const intervalMs = preferences.accountAutoRefresh.interval * 1000
    this.refreshTimer = setInterval(async () => {
      await this.performBackgroundRefresh()
    }, intervalMs)

    logger.info("自动刷新已启动", {
      intervalSeconds: preferences.accountAutoRefresh.interval,
    })
  }

  /**
   * Execute a background refresh cycle.
   * Catches errors and notifies frontend listeners.
   *
   * Uses accountStorage.refreshAllAccounts with silent mode (no toast).
   */
  private async performBackgroundRefresh() {
    try {
      logger.info("开始执行后台刷新")

      // 直接调用accountStorage的刷新方法
      const result = await accountStorage.refreshAllAccounts(false)
      logger.info("后台刷新完成", {
        success: result.success,
        failed: result.failed,
      })

      // Opportunistically trigger usage-history sync after refresh cycles when enabled and due.
      void usageHistoryScheduler.runAfterRefreshSync().catch((error) => {
        logger.warn("Usage-history sync after refresh failed", error)
      })

      // 通知前端更新（如果popup是打开的）
      this.notifyFrontend("refresh_completed", result)
    } catch (error) {
      logger.error("后台刷新失败", error)
      this.notifyFrontend("refresh_error", { error: getErrorMessage(error) })
    }
  }

  /**
   * Trigger a one-off immediate refresh (bypasses interval scheduling).
   * @returns Counts of succeeded/failed account refreshes.
   */
  async refreshNow(): Promise<{ success: number; failed: number }> {
    try {
      logger.info("执行立即刷新")
      const result = await accountStorage.refreshAllAccounts(true)
      logger.info("立即刷新完成", {
        success: result.success,
        failed: result.failed,
      })
      return result
    } catch (error) {
      logger.error("立即刷新失败", error)
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
      logger.info("自动刷新已停止")
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
    await userPreferences.savePreferences(updates)
    // 重新设置定时器
    await this.setupAutoRefresh()
    logger.info("设置已更新", updates)
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
      void sendRuntimeMessage(
        {
          type: "AUTO_REFRESH_UPDATE",
          payload: { type, data },
        },
        { maxAttempts: 1 },
      ).catch((error) => {
        // 静默处理"没有接收者"的错误（popup可能没打开）
        if (isMessageReceiverUnavailableError(error)) {
          logger.debug("前端未打开，跳过通知")
          return
        }

        logger.warn("通知前端失败", error)
      })
    } catch (error) {
      // 静默处理错误，避免影响后台刷新
      logger.warn("发送消息异常，可能前端未打开", error)
    }
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.stopAutoRefresh()
    this.isInitialized = false
    logger.info("服务已销毁")
  }
}

// 创建单例实例
export const autoRefreshService = new AutoRefreshService()

let autoRefreshMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for auto-refresh scheduler messages.
 */
export function setupAutoRefreshMessagingListeners() {
  if (autoRefreshMessagingCleanup) {
    return
  }

  autoRefreshMessagingCleanup = [
    onAutoRefreshMessage(AutoRefreshMessageTypes.Setup, () =>
      resolveAutoRefreshSetupMessage(),
    ),
    onAutoRefreshMessage(AutoRefreshMessageTypes.RefreshNow, () =>
      resolveAutoRefreshRefreshNowMessage(),
    ),
    onAutoRefreshMessage(AutoRefreshMessageTypes.Stop, () =>
      resolveAutoRefreshStopMessage(),
    ),
    onAutoRefreshMessage(AutoRefreshMessageTypes.UpdateSettings, ({ data }) =>
      resolveAutoRefreshUpdateSettingsMessage(data),
    ),
    onAutoRefreshMessage(AutoRefreshMessageTypes.GetStatus, () =>
      resolveAutoRefreshGetStatusMessage(),
    ),
  ]
}

/**
 * Resolve a typed request to reapply the current auto-refresh schedule.
 */
export async function resolveAutoRefreshSetupMessage(): Promise<AutoRefreshMutationResponse> {
  try {
    await autoRefreshService.setupAutoRefresh()
    return { success: true, data: undefined }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to refresh all accounts immediately.
 */
export async function resolveAutoRefreshRefreshNowMessage(): Promise<AutoRefreshRefreshNowResponse> {
  try {
    return { success: true, data: await autoRefreshService.refreshNow() }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to stop the active auto-refresh timer.
 */
export async function resolveAutoRefreshStopMessage(): Promise<AutoRefreshMutationResponse> {
  try {
    autoRefreshService.stopAutoRefresh()
    return { success: true, data: undefined }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to persist and apply auto-refresh settings.
 */
export async function resolveAutoRefreshUpdateSettingsMessage(
  request: AutoRefreshUpdateSettingsRequest,
): Promise<AutoRefreshMutationResponse> {
  try {
    await autoRefreshService.updateSettings(request.settings)
    return { success: true, data: undefined }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request for the current auto-refresh runtime status.
 */
export async function resolveAutoRefreshGetStatusMessage(): Promise<AutoRefreshStatusResponse> {
  try {
    return { success: true, data: autoRefreshService.getStatus() }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
