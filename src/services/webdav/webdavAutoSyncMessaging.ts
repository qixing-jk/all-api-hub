import { defineExtensionMessaging } from "@webext-core/messaging"

import type { UserPreferences } from "~/services/preferences/userPreferences"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { WebDAVSettings } from "~/types/webdav"

export interface WebdavAutoSyncUpdateSettingsRequest {
  settings: Pick<
    Partial<WebDAVSettings>,
    "autoSync" | "syncInterval" | "syncStrategy"
  >
  expectedLastUpdated?: number
}

export type WebdavAutoSyncMutationResponse =
  RuntimeMessageResponse<UserPreferences>

export type WebdavAutoSyncSyncNowResponse = RuntimeMessageResponse<{
  message?: string
}>

export type WebdavAutoSyncStatusResponse = RuntimeMessageResponse<{
  isRunning: boolean
  isInitialized: boolean
  isSyncing: boolean
  lastSyncTime: number
  lastSyncStatus: "success" | "error" | "idle"
  lastSyncError: string | null
}>

interface WebdavAutoSyncProtocolMap {
  [WebdavAutoSyncMessageTypes.Setup](): RuntimeMessageResponse<undefined>
  [WebdavAutoSyncMessageTypes.SyncNow](): WebdavAutoSyncSyncNowResponse
  [WebdavAutoSyncMessageTypes.Stop](): RuntimeMessageResponse<undefined>
  [WebdavAutoSyncMessageTypes.UpdateSettings](
    data: WebdavAutoSyncUpdateSettingsRequest,
  ): WebdavAutoSyncMutationResponse
  [WebdavAutoSyncMessageTypes.GetStatus](): WebdavAutoSyncStatusResponse
}

export const {
  sendMessage: sendWebdavAutoSyncMessage,
  onMessage: onWebdavAutoSyncMessage,
} = defineExtensionMessaging<WebdavAutoSyncProtocolMap>({
  logger: createRuntimeMessagingLogger("WebdavAutoSyncMessaging"),
})
