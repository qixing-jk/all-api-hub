import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import { uploadLocalCloudSyncSnapshot } from "~/services/webdav/cloudSyncTransaction"
import {
  BEST_EFFORT_UPLOAD_DELAY_MINUTES,
  WEBDAV_AUTO_SYNC_ALARMS,
} from "~/services/webdav/webdavAutoSyncAlarms"
import { isCloudSyncConfigured } from "~/services/webdav/webdavAutoSyncPolicy"
import { type WebdavSyncRunLifecycle } from "~/services/webdav/webdavSyncRunLifecycle"
import {
  resolveWebdavSyncDataSelection,
  WEBDAV_SYNC_STRATEGIES,
} from "~/types/webdav"
import { clearAlarm, createAlarm, hasAlarmsAPI } from "~/utils/browser/alarms"
import { onStorageChanged } from "~/utils/browser/storage"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("WebdavAutoSync")
/** Owns deletion-triggered upload scheduling and execution on the shared run lifecycle. */
export class WebdavAccountChangeUpload {
  constructor(
    private readonly dependencies: {
      syncRuns: WebdavSyncRunLifecycle
      isAccountChangeSuppressed: () => boolean
      notifyFrontend: (type: string, data: unknown) => void
    },
  ) {}

  subscribeToAccountStorageChanges(): () => void {
    const listener = (
      changes: Record<string, browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return
      const accountChange = changes[ACCOUNT_STORAGE_KEYS.ACCOUNTS]
      if (!accountChange) return
      if (this.dependencies.isAccountChangeSuppressed()) {
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

  hasDeletedSharedEntries(change: browser.storage.StorageChange) {
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

  async handleSharedAccountStorageChanged() {
    try {
      if (!(await this.shouldScheduleBestEffortUploadForAccounts())) {
        return
      }

      await this.scheduleBestEffortUpload("account_storage_changed")
    } catch (error) {
      logger.warn("Failed to schedule best-effort WebDAV upload", error)
    }
  }

  async shouldScheduleBestEffortUploadForAccounts() {
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

  async scheduleBestEffortUpload(reason: string) {
    await clearAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload)
    await createAlarm(WEBDAV_AUTO_SYNC_ALARMS.BestEffortUpload, {
      // MV3 service workers cannot rely on short-lived timers. A one-shot alarm is slower
      // than `setTimeout`, but it survives worker suspension and still gives us an
      // upload-first opportunity before the next regular merge run.
      delayInMinutes: BEST_EFFORT_UPLOAD_DELAY_MINUTES,
    })

    logger.info("已调度尽力而为的 WebDAV 主动上传", {
      reason,
      delayInMinutes: BEST_EFFORT_UPLOAD_DELAY_MINUTES,
    })
  }

  async performBestEffortUpload() {
    const outcome = await this.dependencies.syncRuns.run(
      async () => {
        logger.info("开始执行尽力而为的 WebDAV 主动上传")
        await uploadLocalCloudSyncSnapshot()
      },
      {
        success: () =>
          this.dependencies.notifyFrontend("sync_completed", {
            timestamp: this.dependencies.syncRuns.getStatus().lastSyncTime,
          }),
        failure: (error) => {
          logger.warn("尽力而为的 WebDAV 主动上传失败", error)
          this.dependencies.notifyFrontend("sync_error", {
            error: getErrorMessage(error),
          })
        },
      },
    )
    if (outcome.kind === "busy") {
      logger.debug("常规同步正在进行中，延后尽力而为上传")
      await this.scheduleBestEffortUpload("sync_in_progress")
    }
  }
}
