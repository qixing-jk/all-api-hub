import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { DisplaySiteData } from "~/types"
import type {
  AutoCheckinPreferences,
  AutoCheckinRunResult,
  AutoCheckinRunSummary,
  AutoCheckinStatus,
} from "~/types/autoCheckin"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

export interface AutoCheckinRunNowRequest {
  accountIds?: string[]
  tempWindowRequestSource?: TempWindowRequestSource
}

export interface AutoCheckinDebugScheduleDailyAlarmForTodayRequest {
  minutesFromNow?: number
}

export interface AutoCheckinPretriggerDailyOnUiOpenRequest {
  requestId?: string
  dryRun?: boolean
  debug?: boolean
  tempWindowRequestSource?: TempWindowRequestSource
}

type AutoCheckinPretriggerDailyOnUiOpenResponse =
  | {
      success: true
      started: boolean
      eligible: boolean
      ineligibleReason?: string
      debug?: unknown
      summary?: AutoCheckinRunSummary
      lastRunResult?: AutoCheckinRunResult
      pendingRetry?: boolean
    }
  | {
      success: false
      error: string
    }

interface AutoCheckinRetryAccountRequest {
  accountId?: string
  tempWindowRequestSource?: TempWindowRequestSource
}

export interface AutoCheckinGetAccountInfoRequest {
  accountId?: string
  includeDisabled?: boolean
}

export interface AutoCheckinUpdateSettingsRequest {
  settings: Partial<
    Pick<
      AutoCheckinPreferences,
      | "globalEnabled"
      | "pretriggerDailyOnUiOpen"
      | "notifyUiOnCompletion"
      | "windowStart"
      | "windowEnd"
      | "scheduleMode"
      | "deterministicTime"
    >
  > & {
    retryStrategy?: Partial<AutoCheckinPreferences["retryStrategy"]>
  }
}

export type AutoCheckinBasicResponse =
  | {
      success: true
      summary?: AutoCheckinRunSummary
      lastRunResult?: AutoCheckinRunResult
      pendingRetry?: boolean
    }
  | { success: false; error: string }

type AutoCheckinScheduleTodayResponse =
  | { success: true; scheduledTime: number | null }
  | { success: false; error: string }

type AutoCheckinGetAccountInfoResponse =
  | { success: true; data: DisplaySiteData }
  | { success: false; error: string }

type AutoCheckinGetStatusResponse =
  | { success: true; data: AutoCheckinStatus | null }
  | { success: false; error: string }

interface AutoCheckinProtocolMap {
  [AutoCheckinMessageTypes.RunNow](
    data: AutoCheckinRunNowRequest,
  ): AutoCheckinBasicResponse
  [AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow](): AutoCheckinBasicResponse
  [AutoCheckinMessageTypes.DebugTriggerRetryAlarmNow](): AutoCheckinBasicResponse
  [AutoCheckinMessageTypes.DebugResetLastDailyRunDay](): AutoCheckinBasicResponse
  [AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday](
    data: AutoCheckinDebugScheduleDailyAlarmForTodayRequest,
  ): AutoCheckinScheduleTodayResponse
  [AutoCheckinMessageTypes.PretriggerDailyOnUiOpen](
    data: AutoCheckinPretriggerDailyOnUiOpenRequest,
  ): AutoCheckinPretriggerDailyOnUiOpenResponse
  [AutoCheckinMessageTypes.RetryAccount](
    data: AutoCheckinRetryAccountRequest,
  ): AutoCheckinBasicResponse
  [AutoCheckinMessageTypes.GetAccountInfo](
    data: AutoCheckinGetAccountInfoRequest,
  ): AutoCheckinGetAccountInfoResponse
  [AutoCheckinMessageTypes.GetStatus](): AutoCheckinGetStatusResponse
  [AutoCheckinMessageTypes.UpdateSettings](
    data: AutoCheckinUpdateSettingsRequest,
  ): AutoCheckinBasicResponse
}

export const {
  sendMessage: sendAutoCheckinMessage,
  onMessage: onAutoCheckinMessage,
} = defineExtensionMessaging<AutoCheckinProtocolMap>({
  logger: createRuntimeMessagingLogger("AutoCheckinMessaging"),
})
