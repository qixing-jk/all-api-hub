import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import {
  createRuntimeMessageFailure,
  type RuntimeMessageResponse,
} from "~/services/runtimeMessaging/result"
import {
  onWebdavAutoSyncMessage,
  type WebdavAutoSyncMutationResponse,
  type WebdavAutoSyncStatusResponse,
  type WebdavAutoSyncSyncNowResponse,
  type WebdavAutoSyncUpdateSettingsRequest,
} from "~/services/webdav/webdavAutoSyncMessaging"
import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("WebdavAutoSync")

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
