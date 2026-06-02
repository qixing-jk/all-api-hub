import { defineExtensionMessaging } from "@webext-core/messaging"

import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedSiteChannelListData } from "~/types/managedSite"
import type {
  ExecutionProgress,
  ExecutionResult,
} from "~/types/managedSiteModelSync"

import type { managedSiteModelSyncStorage } from "./storage"

interface ModelSyncTriggerSelectedRequest {
  channelIds: number[]
}

export interface ModelSyncUpdateSettingsRequest {
  settings: {
    enableSync?: boolean
    intervalMs?: number
    concurrency?: number
    maxRetries?: number
    rateLimit?: {
      requestsPerMinute?: number
      burst?: number
    }
    allowedModels?: string[]
    globalChannelModelFilters?: ChannelModelFilterRule[]
  }
}

interface ModelSyncNextRun {
  nextScheduledAt?: string
  periodInMinutes?: number
}

type ModelSyncPreferences = Awaited<
  ReturnType<typeof managedSiteModelSyncStorage.getPreferences>
>

type ModelSyncUpstreamModelOptions = Awaited<
  ReturnType<typeof managedSiteModelSyncStorage.getChannelUpstreamModelOptions>
>

type ModelSyncMutationResponse =
  | { success: true }
  | { success: false; error: string }

interface ModelSyncProtocolMap {
  [ModelSyncMessageTypes.GetNextRun](): RuntimeMessageResponse<ModelSyncNextRun>
  [ModelSyncMessageTypes.TriggerAll](): RuntimeMessageResponse<ExecutionResult>
  [ModelSyncMessageTypes.TriggerSelected](
    data: ModelSyncTriggerSelectedRequest,
  ): RuntimeMessageResponse<ExecutionResult>
  [ModelSyncMessageTypes.TriggerFailedOnly](): RuntimeMessageResponse<ExecutionResult>
  [ModelSyncMessageTypes.GetLastExecution](): RuntimeMessageResponse<ExecutionResult | null>
  [ModelSyncMessageTypes.GetProgress](): RuntimeMessageResponse<ExecutionProgress | null>
  [ModelSyncMessageTypes.UpdateSettings](
    data: ModelSyncUpdateSettingsRequest,
  ): ModelSyncMutationResponse
  [ModelSyncMessageTypes.GetPreferences](): RuntimeMessageResponse<ModelSyncPreferences>
  [ModelSyncMessageTypes.GetChannelUpstreamModelOptions](): RuntimeMessageResponse<ModelSyncUpstreamModelOptions>
  [ModelSyncMessageTypes.ListChannels](): RuntimeMessageResponse<ManagedSiteChannelListData>
}

export const {
  sendMessage: sendModelSyncMessage,
  onMessage: onModelSyncMessage,
} = defineExtensionMessaging<ModelSyncProtocolMap>({
  logger: createRuntimeMessagingLogger("ModelSyncMessaging"),
})
