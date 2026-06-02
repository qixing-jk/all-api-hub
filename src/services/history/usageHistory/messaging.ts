import { defineExtensionMessaging } from "@webext-core/messaging"

import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { UsageHistoryMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { UsageHistoryPreferences } from "~/types/usageHistory"

import type { syncUsageHistoryForAccount } from "./sync"

export interface UsageHistoryUpdateSettingsRequest {
  settings: Partial<
    Pick<
      UsageHistoryPreferences,
      "enabled" | "retentionDays" | "scheduleMode" | "syncIntervalMinutes"
    >
  >
}

export interface UsageHistorySyncNowRequest {
  accountIds?: string[]
}

export type UsageHistoryUpdateSettingsResponse = RuntimeMessageResponse<{
  warning?: string
}>

export type UsageHistorySyncNowAccountResult = Awaited<
  ReturnType<typeof syncUsageHistoryForAccount>
>

export type UsageHistorySyncNowResponse = RuntimeMessageResponse<{
  totals: {
    success: number
    skipped: number
    error: number
    unsupported: number
  }
  perAccount: UsageHistorySyncNowAccountResult[]
} | null>

interface UsageHistoryProtocolMap {
  [UsageHistoryMessageTypes.UpdateSettings](
    data: UsageHistoryUpdateSettingsRequest,
  ): UsageHistoryUpdateSettingsResponse
  [UsageHistoryMessageTypes.SyncNow](
    data?: UsageHistorySyncNowRequest,
  ): UsageHistorySyncNowResponse
  [UsageHistoryMessageTypes.Prune](): RuntimeMessageResponse<undefined>
}

export const {
  sendMessage: sendUsageHistoryMessage,
  onMessage: onUsageHistoryMessage,
} = defineExtensionMessaging<UsageHistoryProtocolMap>({
  logger: createRuntimeMessagingLogger("UsageHistoryMessaging"),
})
