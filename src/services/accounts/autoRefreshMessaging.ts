import { defineExtensionMessaging } from "@webext-core/messaging"

import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { AccountAutoRefresh } from "~/types/accountAutoRefresh"

export const AutoRefreshMessageTypes = {
  Setup: "autoRefresh:setup",
  RefreshNow: "autoRefresh:refreshNow",
  Stop: "autoRefresh:stop",
  UpdateSettings: "autoRefresh:updateSettings",
  GetStatus: "autoRefresh:getStatus",
} as const

export interface AutoRefreshUpdateSettingsRequest {
  settings: {
    accountAutoRefresh: Partial<AccountAutoRefresh>
  }
}

export type AutoRefreshRefreshNowResponse = RuntimeMessageResponse<{
  success: number
  failed: number
}>

export type AutoRefreshStatusResponse = RuntimeMessageResponse<{
  isRunning: boolean
  isInitialized: boolean
}>

export type AutoRefreshMutationResponse = RuntimeMessageResponse<undefined>

interface AutoRefreshProtocolMap {
  [AutoRefreshMessageTypes.Setup](): AutoRefreshMutationResponse
  [AutoRefreshMessageTypes.RefreshNow](): AutoRefreshRefreshNowResponse
  [AutoRefreshMessageTypes.Stop](): AutoRefreshMutationResponse
  [AutoRefreshMessageTypes.UpdateSettings](
    data: AutoRefreshUpdateSettingsRequest,
  ): AutoRefreshMutationResponse
  [AutoRefreshMessageTypes.GetStatus](): AutoRefreshStatusResponse
}

export const {
  sendMessage: sendAutoRefreshMessage,
  onMessage: onAutoRefreshMessage,
} = defineExtensionMessaging<AutoRefreshProtocolMap>({
  logger: createRuntimeMessagingLogger("AutoRefreshMessaging"),
})
