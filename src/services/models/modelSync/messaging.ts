import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedModelChannelSummaryListData } from "~/types/managedResourceModels"
import type {
  ExecutionHistoryResult,
  ExecutionResult,
  ScopedExecutionProgress,
} from "~/types/managedSiteModelSync"

import type { managedSiteModelSyncStorage } from "./storage"

interface ModelSyncTriggerRequest {
  protectionBypassExecution: ProtectionBypassExecution
}

interface ModelSyncTriggerSelectedRequest extends ModelSyncTriggerRequest {
  resourceRefs: ManagedResourceRef[]
}

export interface ModelSyncUpdateSettingsRequest {
  settings: {
    enableSync?: boolean
    intervalMs?: number
    concurrency?: number
    maxRetries?: number
    channelProcessingTimeout?: number
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
  [ModelSyncMessageTypes.TriggerAll](
    data: ModelSyncTriggerRequest,
  ): RuntimeMessageResponse<ExecutionResult>
  [ModelSyncMessageTypes.TriggerSelected](
    data: ModelSyncTriggerSelectedRequest,
  ): RuntimeMessageResponse<ExecutionResult>
  [ModelSyncMessageTypes.TriggerFailedOnly](
    data: ModelSyncTriggerRequest,
  ): RuntimeMessageResponse<ExecutionResult>
  [ModelSyncMessageTypes.GetLastExecution](): RuntimeMessageResponse<ExecutionHistoryResult | null>
  [ModelSyncMessageTypes.GetProgress](): RuntimeMessageResponse<ScopedExecutionProgress | null>
  [ModelSyncMessageTypes.UpdateSettings](
    data: ModelSyncUpdateSettingsRequest,
  ): ModelSyncMutationResponse
  [ModelSyncMessageTypes.GetPreferences](): RuntimeMessageResponse<ModelSyncPreferences>
  [ModelSyncMessageTypes.GetChannelUpstreamModelOptions](): RuntimeMessageResponse<ModelSyncUpstreamModelOptions>
  [ModelSyncMessageTypes.ListChannels](): RuntimeMessageResponse<ManagedModelChannelSummaryListData>
}

export const {
  sendMessage: sendModelSyncMessage,
  onMessage: onModelSyncMessage,
} = defineExtensionMessaging<ModelSyncProtocolMap>({
  logger: createRuntimeMessagingLogger("ModelSyncMessaging"),
})
