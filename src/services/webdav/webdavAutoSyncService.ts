import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  CLOUD_SYNC_PROVIDERS,
  isWebdavSyncDataSelectionEmpty,
  resolveWebdavSyncDataSelection,
  WEBDAV_SYNC_STRATEGIES,
  type CloudSyncProvider,
  type WebDAVSettings,
} from "~/types/webdav"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  isMessageReceiverUnavailableError,
  onAlarm,
  onStorageChanged,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { ACCOUNT_STORAGE_KEYS } from "../core/storageKeys"
import {
  userPreferences,
  type PreferenceWriteFailure,
  type UserPreferences,
} from "../preferences/userPreferences"
import { WebdavAutoSyncMessageTypes } from "../runtimeMessaging/messageTypes"
import {
  createRuntimeMessageFailure,
  type RuntimeMessageResponse,
} from "../runtimeMessaging/result"
import { getCloudSyncProvider } from "./cloudSyncService"
import {
  executeCloudSyncTransaction,
  uploadLocalCloudSyncSnapshot,
} from "./cloudSyncTransaction"
import {
  onWebdavAutoSyncMessage,
  type WebdavAutoSyncMutationResponse,
  type WebdavAutoSyncStatusResponse,
  type WebdavAutoSyncSyncNowResponse,
  type WebdavAutoSyncUpdateSettingsRequest,
} from "./webdavAutoSyncMessaging"
import { applyWebdavSyncResult } from "./webdavSyncApply"

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
 * Convert the persisted WebDAV sync interval (seconds) to a safe alarms cadence (minutes).
 *
 * Notes:
 * - `browser.alarms` operates in minutes and generally requires >= 1 minute.
 * - The options UI constrains WebDAV interval to [60..86400] seconds in 60s steps, but we still clamp defensively.
 */
function clampWebdavSyncIntervalMinutes(
  value: unknown,
  provider: CloudSyncProvider = CLOUD_SYNC_PROVIDERS.WEBDAV,
): number {
  const seconds = Number(value)
  const safeSeconds = Number.isFinite(seconds) ? seconds : 3600
  const minutes = Math.trunc(safeSeconds / 60)
  const minimumMinutes = provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST ? 5 : 1
  return Math.min(24 * 60, Math.max(minimumMinutes, minutes))
}

/** Check the active provider's minimum credentials for scheduled sync. */
function isCloudSyncConfigured(settings: WebDAVSettings): boolean {
  if (getCloudSyncProvider(settings) === CLOUD_SYNC_PROVIDERS.GITHUB_GIST) {
    return Boolean(
      settings.githubGist?.token?.trim() &&
        settings.githubGist?.gistId?.trim() &&
        settings.backupEncryptionPassword?.trim(),
    )
  }

  return Boolean(
    settings.url?.trim() &&
      settings.username?.trim() &&
      settings.password?.trim(),
  )
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
  static readonly ALARM_NAME = "webdavAutoSync"
  static readonly BEST_EFFORT_UPLOAD_ALARM_NAME =
    "webdavAutoSyncBestEffortUpload"
  private static readonly BEST_EFFORT_UPLOAD_DELAY_MINUTES = 1

  private removeAlarmListener: (() => void) | null = null
  private removeStorageChangeListener: (() => void) | null = null
  private isInitialized = false
  private isSyncing = false
  private isScheduled = false
  private suppressAccountStorageChangeHandling = false
  private lastSyncTime = 0
  private lastSyncStatus: "success" | "error" | "idle" = "idle"
  private lastSyncError: string | null = null

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
        if (alarm.name === WebdavAutoSyncService.ALARM_NAME) {
          // Await to keep the MV3 service worker alive for the duration of the sync.
          await this.performBackgroundSync()
          return
        }

        if (
          alarm.name === WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME
        ) {
          await this.performBestEffortUpload()
        }
      })
      this.removeStorageChangeListener = this.subscribeToAccountStorageChanges()

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
        await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
        await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)
        this.isScheduled = false
        logger.info("自动同步已关闭")
        return
      }

      const provider = getCloudSyncProvider(preferences.webdav)

      // 检查当前同步服务配置是否完整；缺失凭据时跳过自动同步。
      if (!isCloudSyncConfigured(preferences.webdav)) {
        await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
        await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)
        this.isScheduled = false
        logger.warn("云端同步配置不完整，无法启动自动同步", { provider })
        return
      }

      const syncDataSelection = resolveWebdavSyncDataSelection(
        preferences.webdav.syncData,
      )

      if (isWebdavSyncDataSelectionEmpty(syncDataSelection)) {
        await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
        await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)
        this.isScheduled = false
        logger.warn(
          "WebDAV sync selection is empty; auto-sync remains unscheduled",
        )
        return
      }

      if (!hasAlarmsAPI()) {
        await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
        await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)
        this.isScheduled = false
        logger.warn("Alarms API not supported; WebDAV auto-sync is disabled")
        return
      }

      if (
        preferences.webdav.syncStrategy ===
          WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY ||
        (!syncDataSelection.accounts && !syncDataSelection.bookmarks)
      ) {
        await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)
      }

      const intervalMinutes = clampWebdavSyncIntervalMinutes(
        preferences.webdav.syncInterval,
        provider,
      )

      // Preserve a matching alarm when possible so background restarts do not shift the schedule.
      const existingAlarm = await getAlarm(WebdavAutoSyncService.ALARM_NAME)
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

      await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
      await createAlarm(WebdavAutoSyncService.ALARM_NAME, {
        // Match previous setInterval semantics: first run happens after the full interval.
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes,
      })

      this.isScheduled = Boolean(
        await getAlarm(WebdavAutoSyncService.ALARM_NAME),
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
    if (this.isSyncing) {
      logger.debug("同步正在进行中，跳过本次执行")
      return
    }

    this.isSyncing = true
    try {
      logger.info("开始执行后台同步")

      await this.syncWithWebdav()
      // A successful strategy-aware sync supersedes any queued snapshot upload.
      // Running the section-level best-effort upload first can overwrite a
      // newer remote addition before Smart Merge sees it.
      await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)

      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null

      logger.info("后台同步完成")

      // 通知前端更新（如果popup是打开的）
      this.notifyFrontend("sync_completed", {
        timestamp: this.lastSyncTime,
      })
      await notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.WebdavAutoSync,
        status: TASK_NOTIFICATION_STATUSES.Success,
      })
    } catch (error) {
      logger.error("后台同步失败", error)
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      this.notifyFrontend("sync_error", { error: getErrorMessage(error) })
      await notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.WebdavAutoSync,
        status: TASK_NOTIFICATION_STATUSES.Failure,
        message: getErrorMessage(error),
      })
    } finally {
      this.isSyncing = false
    }
  }

  private subscribeToAccountStorageChanges(): () => void {
    const listener = (
      changes: Record<string, browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return
      const accountChange = changes[ACCOUNT_STORAGE_KEYS.ACCOUNTS]
      if (!accountChange) return
      if (this.suppressAccountStorageChangeHandling) {
        logger.debug("忽略 WebDAV 本地回写触发的账号存储变更")
        return
      }
      if (!this.hasDeletedSharedEntries(accountChange)) {
        return
      }

      void this.handleSharedAccountStorageChanged()
    }

    return onStorageChanged(listener)
  }

  private hasDeletedSharedEntries(change: browser.storage.StorageChange) {
    const oldAccountsConfig =
      change.oldValue && typeof change.oldValue === "object"
        ? (change.oldValue as {
            accounts?: Array<{ id?: string }>
            bookmarks?: Array<{ id?: string }>
          })
        : {}
    const newAccountsConfig =
      change.newValue && typeof change.newValue === "object"
        ? (change.newValue as {
            accounts?: Array<{ id?: string }>
            bookmarks?: Array<{ id?: string }>
          })
        : {}

    const collectIds = (entries: Array<{ id?: string }> | undefined) =>
      new Set(
        (entries || [])
          .map((entry) => entry?.id)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
      )

    const oldIds = collectIds([
      ...(oldAccountsConfig.accounts || []),
      ...(oldAccountsConfig.bookmarks || []),
    ])
    const newIds = collectIds([
      ...(newAccountsConfig.accounts || []),
      ...(newAccountsConfig.bookmarks || []),
    ])

    for (const id of oldIds) {
      if (!newIds.has(id)) {
        return true
      }
    }

    return false
  }

  private async handleSharedAccountStorageChanged() {
    try {
      if (!(await this.shouldScheduleBestEffortUploadForAccounts())) {
        return
      }

      await this.scheduleBestEffortUpload("account_storage_changed")
    } catch (error) {
      logger.warn("Failed to schedule best-effort WebDAV upload", error)
    }
  }

  private async shouldScheduleBestEffortUploadForAccounts() {
    if (!hasAlarmsAPI()) {
      return false
    }

    const preferences = await userPreferences.getPreferences()
    if (!preferences.webdav.autoSync) {
      return false
    }

    if (!isCloudSyncConfigured(preferences.webdav)) {
      return false
    }

    if (
      preferences.webdav.syncStrategy === WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY
    ) {
      return false
    }

    const syncDataSelection = resolveWebdavSyncDataSelection(
      preferences.webdav.syncData,
    )

    return syncDataSelection.accounts || syncDataSelection.bookmarks
  }

  private async scheduleBestEffortUpload(reason: string) {
    await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)
    await createAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME, {
      // MV3 service workers cannot rely on short-lived timers. A one-shot alarm is slower
      // than `setTimeout`, but it survives worker suspension and still gives us an
      // upload-first opportunity before the next regular merge run.
      delayInMinutes: WebdavAutoSyncService.BEST_EFFORT_UPLOAD_DELAY_MINUTES,
    })

    logger.info("已调度尽力而为的 WebDAV 主动上传", {
      reason,
      delayInMinutes: WebdavAutoSyncService.BEST_EFFORT_UPLOAD_DELAY_MINUTES,
    })
  }

  private async performBestEffortUpload() {
    if (this.isSyncing) {
      logger.debug("常规同步正在进行中，延后尽力而为上传")
      await this.scheduleBestEffortUpload("sync_in_progress")
      return
    }

    this.isSyncing = true
    try {
      logger.info("开始执行尽力而为的 WebDAV 主动上传")
      await uploadLocalCloudSyncSnapshot()
      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null
      this.notifyFrontend("sync_completed", {
        timestamp: this.lastSyncTime,
      })
    } catch (error) {
      logger.warn("尽力而为的 WebDAV 主动上传失败", error)
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      this.notifyFrontend("sync_error", { error: getErrorMessage(error) })
    } finally {
      this.isSyncing = false
    }
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
    if (this.isSyncing) {
      return {
        success: false,
        message: "同步正在进行中，请稍后再试",
      }
    }

    this.isSyncing = true
    try {
      logger.info("执行立即同步")
      await this.syncWithWebdav()
      // The regular sync already reconciles the pending local change safely.
      await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)
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
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 停止自动同步
   *
   * Clears the scheduled alarm; idempotent.
   */
  async stopAutoSync() {
    const cleared = await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
    await clearAlarm(WebdavAutoSyncService.BEST_EFFORT_UPLOAD_ALARM_NAME)
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

let webdavAutoSyncMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for WebDAV auto-sync messages.
 */
export function setupWebdavAutoSyncMessagingListeners() {
  if (webdavAutoSyncMessagingCleanup) {
    return
  }

  webdavAutoSyncMessagingCleanup = [
    onWebdavAutoSyncMessage(WebdavAutoSyncMessageTypes.Setup, () =>
      resolveWebdavAutoSyncSetupMessage(),
    ),
    onWebdavAutoSyncMessage(WebdavAutoSyncMessageTypes.SyncNow, () =>
      resolveWebdavAutoSyncSyncNowMessage(),
    ),
    onWebdavAutoSyncMessage(WebdavAutoSyncMessageTypes.Stop, () =>
      resolveWebdavAutoSyncStopMessage(),
    ),
    onWebdavAutoSyncMessage(
      WebdavAutoSyncMessageTypes.UpdateSettings,
      ({ data }) => resolveWebdavAutoSyncUpdateSettingsMessage(data),
    ),
    onWebdavAutoSyncMessage(WebdavAutoSyncMessageTypes.GetStatus, () =>
      resolveWebdavAutoSyncGetStatusMessage(),
    ),
  ]
}

/**
 * Resolve a typed request to reapply the WebDAV auto-sync schedule.
 */
export async function resolveWebdavAutoSyncSetupMessage(): Promise<
  RuntimeMessageResponse<undefined>
> {
  try {
    await webdavAutoSyncService.setupAutoSync()
    return { success: true, data: undefined }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to run WebDAV auto-sync immediately.
 */
export async function resolveWebdavAutoSyncSyncNowMessage(): Promise<WebdavAutoSyncSyncNowResponse> {
  try {
    const result = await webdavAutoSyncService.syncNow()
    return result.success
      ? { success: true, data: { message: result.message } }
      : { success: false, error: result.message ?? "" }
  } catch (error) {
    logger.error("处理消息失败", error)
    return { success: false, error: getErrorMessage(error) }
  }
}

/**
 * Resolve a typed request to stop WebDAV auto-sync scheduling.
 */
export async function resolveWebdavAutoSyncStopMessage(): Promise<
  RuntimeMessageResponse<undefined>
> {
  try {
    await webdavAutoSyncService.stopAutoSync()
    return { success: true, data: undefined }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to persist and apply WebDAV auto-sync settings.
 */
export async function resolveWebdavAutoSyncUpdateSettingsMessage(
  request: WebdavAutoSyncUpdateSettingsRequest,
): Promise<WebdavAutoSyncMutationResponse> {
  try {
    const result = await webdavAutoSyncService.updateSettings(
      request.settings,
      typeof request.expectedLastUpdated === "number"
        ? {
            expectedLastUpdated: request.expectedLastUpdated,
          }
        : undefined,
    )
    return result.ok
      ? {
          success: true,
          data: result.savedPreferences,
        }
      : {
          success: false,
          error:
            result.reason.type === "stale"
              ? t("settings:messages.preferencesChangedExternally")
              : t("settings:messages.saveSettingsFailed"),
        }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request for WebDAV auto-sync runtime status.
 */
export async function resolveWebdavAutoSyncGetStatusMessage(): Promise<WebdavAutoSyncStatusResponse> {
  try {
    return { success: true, data: webdavAutoSyncService.getStatus() }
  } catch (error) {
    logger.error("处理消息失败", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
