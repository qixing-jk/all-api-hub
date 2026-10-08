import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import { type PreferenceWriteFailure } from "~/services/preferences/preferencesStore"
import { userPreferences } from "~/services/preferences/userPreferences"
import { WebdavAccountChangeUpload } from "~/services/webdav/autoSync/webdavAccountChangeUpload"
import { WEBDAV_AUTO_SYNC_ALARMS } from "~/services/webdav/autoSync/webdavAutoSyncAlarms"
import {
  clampWebdavSyncIntervalMinutes,
  isCloudSyncConfigured,
} from "~/services/webdav/autoSync/webdavAutoSyncPolicy"
import { getCloudSyncProvider } from "~/services/webdav/cloudSyncService"
import { executeCloudSyncTransaction } from "~/services/webdav/sync/cloudSyncTransaction"
import { applyWebdavSyncResult } from "~/services/webdav/sync/webdavSyncApply"
import { WebdavSyncRunLifecycle } from "~/services/webdav/sync/webdavSyncRunLifecycle"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  isWebdavSyncDataSelectionEmpty,
  resolveWebdavSyncDataSelection,
  WEBDAV_SYNC_STRATEGIES,
  type WebDAVSettings,
} from "~/types/webdav"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/alarms"
import {
  isMessageReceiverUnavailableError,
  sendRuntimeMessage,
} from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("WebdavAutoSync")

type UpdateWebdavAutoSyncSettingsResult =
  | {
      ok: true
      savedPreferences: UserPreferences
    }
  | {
      ok: false
      reason: PreferenceWriteFailure
    }

/**
 * Manages WebDAV auto-sync in the background.
 * Responsibilities:
 * - Reads WebDAV preferences to decide if/when to sync.
 * - Uses WebExtension alarms (MV3-safe) with an isSyncing guard to avoid overlap.
 * - Merges or uploads backups according to user-selected strategy.
 * - Notifies frontends about sync status/results.
 */
class WebdavAutoSyncService {
  private removeAlarmListener: (() => void) | null = null
  private removeStorageChangeListener: (() => void) | null = null
  private isInitialized = false
  private readonly syncRuns = new WebdavSyncRunLifecycle()
  private isScheduled = false
  private suppressAccountStorageChangeHandling = false
  private readonly accountChangeUpload = new WebdavAccountChangeUpload({
    syncRuns: this.syncRuns,
    isAccountChangeSuppressed: () => this.suppressAccountStorageChangeHandling,
    notifyFrontend: (type, data) => this.notifyFrontend(type, data),
  })

  /**
   * Initialize auto-sync (idempotent).
   * Loads preferences and starts alarm schedule when enabled.
   *
   * Safe to call multiple times; returns early if already initialized.
   */
  async initialize() {
    if (this.isInitialized) {
      logger.debug("服务已初始化")
      return
    }

    try {
      // Register alarm listener early. In MV3 service workers, timers are unreliable; alarms are the stable scheduler.
      this.removeAlarmListener = onAlarm(async (alarm) => {
        if (alarm.name === WEBDAV_AUTO_SYNC_ALARMS.Periodic) {
          // Await to keep the MV3 service worker alive for the duration of the sync.
          await this.performBackgroundSync()
          return
        }

        if (alarm.name === WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload) {
          await this.accountChangeUpload.performBestEffortUpload()
        }
      })
      this.removeStorageChangeListener =
        this.accountChangeUpload.subscribeToAccountStorageChanges()

      await this.setupAutoSync()
      this.isInitialized = true
      logger.info("服务初始化成功")
    } catch (error) {
      logger.error("服务初始化失败", error)
    }
  }

  /**
   * Start or stop auto-sync based on current preferences.
   * Always reconciles the alarms schedule to prevent duplicate schedules.
   *
   * Reads WebDAV creds and interval from user preferences; skips when config
   * is incomplete or disabled.
   */
  async setupAutoSync() {
    try {
      // 获取用户偏好设置
      const preferences = await userPreferences.getPreferences()

      if (!preferences.webdav.autoSync) {
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic)
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
        this.isScheduled = false
        logger.info("自动同步已关闭")
        return
      }

      const provider = getCloudSyncProvider(preferences.webdav)

      // 检查当前同步服务配置是否完整；缺失凭据时跳过自动同步。
      if (!isCloudSyncConfigured(preferences.webdav)) {
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic)
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
        this.isScheduled = false
        logger.warn("云端同步配置不完整，无法启动自动同步", { provider })
        return
      }

      const syncDataSelection = resolveWebdavSyncDataSelection(
        preferences.webdav.syncData,
      )

      if (isWebdavSyncDataSelectionEmpty(syncDataSelection)) {
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic)
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
        this.isScheduled = false
        logger.warn(
          "WebDAV sync selection is empty; auto-sync remains unscheduled",
        )
        return
      }

      if (!hasAlarmsAPI()) {
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic)
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
        this.isScheduled = false
        logger.warn("Alarms API not supported; WebDAV auto-sync is disabled")
        return
      }

      if (
        preferences.webdav.syncStrategy ===
          WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY ||
        (!syncDataSelection.accounts && !syncDataSelection.bookmarks)
      ) {
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
      }

      const intervalMinutes = clampWebdavSyncIntervalMinutes(
        preferences.webdav.syncInterval,
        provider,
      )

      // Preserve a matching alarm when possible so background restarts do not shift the schedule.
      const existingAlarm = await getAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic)
      if (
        existingAlarm &&
        existingAlarm.periodInMinutes != null &&
        Math.abs(existingAlarm.periodInMinutes - intervalMinutes) < 0.001
      ) {
        this.isScheduled = true
        logger.debug("已存在相同周期的 WebDAV 自动同步 alarm，保持不变", {
          periodInMinutes: existingAlarm.periodInMinutes,
          scheduledTime: existingAlarm.scheduledTime
            ? new Date(existingAlarm.scheduledTime)
            : null,
        })
        return
      }

      await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic)
      await createAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic, {
        // Match previous setInterval semantics: first run happens after the full interval.
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes,
      })

      this.isScheduled = Boolean(
        await getAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic),
      )

      logger.info("自动同步已启动", {
        schedule: "alarm",
        intervalSeconds: preferences.webdav.syncInterval || 3600,
        intervalMinutes,
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
    const outcome = await this.syncRuns.run(
      async () => {
        logger.info("开始执行后台同步")
        await this.syncWithWebdav()
        // Strategy-aware sync supersedes the queued snapshot upload.
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
      },
      {
        success: async () => {
          logger.info("后台同步完成")
          this.notifyFrontend("sync_completed", {
            timestamp: this.syncRuns.getStatus().lastSyncTime,
          })
          await notifyTaskResult({
            task: TASK_NOTIFICATION_TASKS.WebdavAutoSync,
            status: TASK_NOTIFICATION_STATUSES.Success,
          })
        },
        failure: async (error) => {
          logger.error("后台同步失败", error)
          this.notifyFrontend("sync_error", { error: getErrorMessage(error) })
          await notifyTaskResult({
            task: TASK_NOTIFICATION_TASKS.WebdavAutoSync,
            status: TASK_NOTIFICATION_STATUSES.Failure,
            message: getErrorMessage(error),
          })
        },
      },
    )
    if (outcome.kind === "busy") logger.debug("同步正在进行中，跳过本次执行")
  }

  /** Execute one sync with local-write notification suppression owned by the scheduler. */
  async syncWithWebdav() {
    await executeCloudSyncTransaction({
      applyLocal: (input) => this.applyLocalSyncResult(input),
    })
  }

  private async applyLocalSyncResult(
    input: Parameters<typeof applyWebdavSyncResult>[0],
  ) {
    this.suppressAccountStorageChangeHandling = true
    try {
      return await applyWebdavSyncResult(input)
    } finally {
      this.suppressAccountStorageChangeHandling = false
    }
  }

  /**
   * 立即执行一次同步
   * @returns Result with success flag and optional message.
   */
  async syncNow(): Promise<{ success: boolean; message?: string }> {
    const outcome = await this.syncRuns.run(
      async () => {
        logger.info("执行立即同步")
        await this.syncWithWebdav()
        await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
      },
      {
        success: () => {
          logger.info("立即同步完成")
        },
        failure: (error) => {
          logger.error("立即同步失败", error)
        },
      },
    )
    if (outcome.kind === "busy")
      return { success: false, message: "同步正在进行中，请稍后再试" }
    if (outcome.kind === "error")
      return { success: false, message: getErrorMessage(outcome.error) }
    return { success: true, message: "同步成功" }
  }

  /**
   * 停止自动同步
   *
   * Clears the scheduled alarm; idempotent.
   */
  async stopAutoSync() {
    const cleared = await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.Periodic)
    await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
    this.isScheduled = false

    if (cleared) {
      logger.info("自动同步已停止")
    } else {
      logger.info("自动同步未运行或已停止")
    }
  }

  /**
   * 更新同步设置
   *
   * Persists partial webdav settings and reconfigures scheduler.
   */
  async updateSettings(
    settings: {
      autoSync?: boolean
      syncInterval?: number
      syncStrategy?: WebDAVSettings["syncStrategy"]
    },
    options?: { expectedLastUpdated?: number },
  ): Promise<UpdateWebdavAutoSyncSettingsResult> {
    try {
      const writeResult = await userPreferences.savePreferencesWithResult(
        {
          webdav: settings,
        },
        options,
      )
      if (!writeResult.ok) {
        return {
          ok: false,
          reason: writeResult.reason,
        }
      }

      await this.setupAutoSync() // 重新设置调度（alarm）
      logger.info("设置已更新", settings)
      return {
        ok: true,
        savedPreferences: writeResult.preferences,
      }
    } catch (error) {
      logger.error("更新设置失败", error)
      return {
        ok: false,
        reason: {
          type: "storage-error",
          error,
        },
      }
    }
  }

  /**
   * 获取当前状态
   * @returns Snapshot of initialization, running, and last-sync info.
   */
  getStatus() {
    return {
      isRunning: this.isScheduled,
      isInitialized: this.isInitialized,
      ...this.syncRuns.getStatus(),
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
      void sendRuntimeMessage(
        {
          type: "WEBDAV_AUTO_SYNC_UPDATE",
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
      // 静默处理错误，避免影响后台同步
      logger.warn("发送消息异常，可能前端未打开", error)
    }
  }

  /**
   * 销毁服务
   */
  destroy() {
    void this.stopAutoSync()
    this.removeAlarmListener?.()
    this.removeAlarmListener = null
    this.removeStorageChangeListener?.()
    this.removeStorageChangeListener = null
    this.isInitialized = false
    logger.info("服务已销毁")
  }
}

// 创建单例实例
export const webdavAutoSyncService = new WebdavAutoSyncService()
