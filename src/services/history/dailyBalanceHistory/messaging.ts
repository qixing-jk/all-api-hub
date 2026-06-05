import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { BalanceHistoryMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { BalanceHistoryPreferences } from "~/types/dailyBalanceHistory"

export interface BalanceHistoryUpdateSettingsRequest {
  settings: Partial<BalanceHistoryPreferences>
}

export interface BalanceHistoryRefreshNowRequest {
  accountIds?: string[]
}

export type BalanceHistoryUpdateSettingsResponse = RuntimeMessageResponse<{
  warning?: string
}>

export type BalanceHistoryRefreshNowResponse = RuntimeMessageResponse<{
  success: number
  failed: number
  refreshedCount: number
} | null>

interface BalanceHistoryProtocolMap {
  [BalanceHistoryMessageTypes.UpdateSettings](
    data: BalanceHistoryUpdateSettingsRequest,
  ): BalanceHistoryUpdateSettingsResponse
  [BalanceHistoryMessageTypes.RefreshNow](
    data?: BalanceHistoryRefreshNowRequest,
  ): BalanceHistoryRefreshNowResponse
  [BalanceHistoryMessageTypes.Prune](): RuntimeMessageResponse<undefined>
}

export const {
  sendMessage: sendBalanceHistoryMessage,
  onMessage: onBalanceHistoryMessage,
} = defineExtensionMessaging<BalanceHistoryProtocolMap>({
  logger: createRuntimeMessagingLogger("BalanceHistoryMessaging"),
})
