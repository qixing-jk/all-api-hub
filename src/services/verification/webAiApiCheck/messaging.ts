import {
  defineExtensionMessaging,
  type Logger,
} from "~/services/runtimeMessaging/extensionMessaging"
import type { ContextCounterInfo } from "~/services/verification/modelQuality/contextTokens"
import type { NeedleSelection } from "~/services/verification/modelQuality/needlePlan"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"
import type { ContextHistoryRequest } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import type {
  ApiVerificationHistoryTarget,
  NeedleSummary,
} from "~/services/verification/verificationResultHistory/types"
import { createLogger } from "~/utils/core/logger"

import type {
  ApiCheckCancelRunProbeRequest,
  ApiCheckCancelRunProbeResponse,
  ApiCheckContextCapacityProgress,
  ApiCheckContextHistoryRequest,
  ApiCheckContextHistoryResponse,
  ApiCheckCreateTagRequest,
  ApiCheckCreateTagResponse,
  ApiCheckFetchModelsRequest,
  ApiCheckFetchModelsResponse,
  ApiCheckGetBaseUrlHistorySuggestionsRequest,
  ApiCheckGetBaseUrlHistorySuggestionsResponse,
  ApiCheckListTagsRequest,
  ApiCheckListTagsResponse,
  ApiCheckQuestionAnswerRequest,
  ApiCheckQuestionAnswerResponse,
  ApiCheckRecordBaseUrlHistoryRequest,
  ApiCheckRecordBaseUrlHistoryResponse,
  ApiCheckRemoveBaseUrlHistoryRequest,
  ApiCheckRemoveBaseUrlHistoryResponse,
  ApiCheckRenameTagRequest,
  ApiCheckRenameTagResponse,
  ApiCheckRunContextCapacityRequest,
  ApiCheckRunContextCapacityResponse,
  ApiCheckRunNeedleRequest,
  ApiCheckRunNeedleResponse,
  ApiCheckRunPelicanRequest,
  ApiCheckRunPelicanResponse,
  ApiCheckRunProbeRequest,
  ApiCheckRunProbeResponse,
  ApiCheckSaveProfileRequest,
  ApiCheckSaveProfileResponse,
  ApiCheckShouldPromptRequest,
  ApiCheckShouldPromptResponse,
} from "./types"

export const WebAiApiCheckMessageTypes = {
  RunQuestionAnswer: "webAiApiCheck:runQuestionAnswer",
  ContextCounter: "webAiApiCheck:contextCounter",
  NeedleHistory: "webAiApiCheck:needleHistory",
  RunNeedle: "webAiApiCheck:runNeedle",
  NeedleProgress: "webAiApiCheck:needleProgress",
  StopNeedleSelection: "webAiApiCheck:stopNeedleSelection",
  DiscardNeedleCheckpoints: "webAiApiCheck:discardNeedleCheckpoints",

  ContextHistory: "webAiApiCheck:contextHistory",
  DiscardContextCheckpoints: "webAiApiCheck:discardContextCheckpoints",
  RunContextCapacity: "webAiApiCheck:runContextCapacity",
  ContextCapacityProgress: "webAiApiCheck:contextCapacityProgress",
  ShouldPrompt: "webAiApiCheck:shouldPrompt",
  SetSiteAccess: "webAiApiCheck:setSiteAccess",
  FetchModels: "webAiApiCheck:fetchModels",
  GetBaseUrlHistorySuggestions: "webAiApiCheck:getBaseUrlHistorySuggestions",
  RecordBaseUrlHistory: "webAiApiCheck:recordBaseUrlHistory",
  RemoveBaseUrlHistory: "webAiApiCheck:removeBaseUrlHistory",
  ListTags: "webAiApiCheck:listTags",
  CreateTag: "webAiApiCheck:createTag",
  RenameTag: "webAiApiCheck:renameTag",
  RunProbe: "webAiApiCheck:runProbe",
  RunPelican: "webAiApiCheck:runPelican",
  CancelRunProbe: "webAiApiCheck:cancelRunProbe",
  SaveProfile: "webAiApiCheck:saveProfile",
} as const

/**
 * Creates a messaging logger that never forwards payload details because
 * Web AI API Check requests carry transient API keys.
 */
function createWebAiApiCheckMessagingLogger(): Logger {
  const logger = createLogger("WebAiApiCheckMessaging")
  const toMessage = (value: unknown) =>
    typeof value === "string" ? value : String(value)

  return {
    debug: (message: unknown) => logger.debug(toMessage(message)),
    log: (message: unknown) => logger.info(toMessage(message)),
    warn: (message: unknown) => logger.warn(toMessage(message)),
    error: (message: unknown) => logger.error(toMessage(message)),
  }
}

interface WebAiApiCheckProtocolMap {
  [WebAiApiCheckMessageTypes.RunQuestionAnswer](
    data: ApiCheckQuestionAnswerRequest,
  ): ApiCheckQuestionAnswerResponse
  [WebAiApiCheckMessageTypes.ContextCounter](data: {
    modelId: string
  }): { success: true; counter: ContextCounterInfo } | { success: false }
  [WebAiApiCheckMessageTypes.NeedleHistory](
    data: ContextHistoryRequest & {
      historyTarget?: ApiVerificationHistoryTarget
    },
  ): { success: true; summary: NeedleSummary | null } | { success: false }
  [WebAiApiCheckMessageTypes.RunNeedle](
    data: ApiCheckRunNeedleRequest,
  ): ApiCheckRunNeedleResponse
  [WebAiApiCheckMessageTypes.NeedleProgress](data: {
    runId: string
    result: NeedleResult
  }): void
  [WebAiApiCheckMessageTypes.StopNeedleSelection](data: {
    runId: string
    selection: NeedleSelection
  }): ApiCheckCancelRunProbeResponse
  [WebAiApiCheckMessageTypes.DiscardNeedleCheckpoints](
    data: Record<string, never>,
  ): { success: true } | { success: false }

  [WebAiApiCheckMessageTypes.DiscardContextCheckpoints](
    data: Record<string, never>,
  ): { success: true; discarded: number } | { success: false }
  [WebAiApiCheckMessageTypes.ContextHistory](
    data: ApiCheckContextHistoryRequest,
  ): ApiCheckContextHistoryResponse
  [WebAiApiCheckMessageTypes.RunContextCapacity](
    data: ApiCheckRunContextCapacityRequest,
  ): ApiCheckRunContextCapacityResponse
  [WebAiApiCheckMessageTypes.ContextCapacityProgress](
    data: ApiCheckContextCapacityProgress,
  ): void
  [WebAiApiCheckMessageTypes.SetSiteAccess](data: {
    pageUrl: string
    enabled: boolean
  }): ApiCheckShouldPromptResponse
  [WebAiApiCheckMessageTypes.ShouldPrompt](
    data: ApiCheckShouldPromptRequest,
  ): ApiCheckShouldPromptResponse
  [WebAiApiCheckMessageTypes.FetchModels](
    data: ApiCheckFetchModelsRequest,
  ): ApiCheckFetchModelsResponse
  [WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions](
    data: ApiCheckGetBaseUrlHistorySuggestionsRequest,
  ): ApiCheckGetBaseUrlHistorySuggestionsResponse
  [WebAiApiCheckMessageTypes.RecordBaseUrlHistory](
    data: ApiCheckRecordBaseUrlHistoryRequest,
  ): ApiCheckRecordBaseUrlHistoryResponse
  [WebAiApiCheckMessageTypes.RemoveBaseUrlHistory](
    data: ApiCheckRemoveBaseUrlHistoryRequest,
  ): ApiCheckRemoveBaseUrlHistoryResponse
  [WebAiApiCheckMessageTypes.ListTags](
    data: ApiCheckListTagsRequest,
  ): ApiCheckListTagsResponse
  [WebAiApiCheckMessageTypes.CreateTag](
    data: ApiCheckCreateTagRequest,
  ): ApiCheckCreateTagResponse
  [WebAiApiCheckMessageTypes.RenameTag](
    data: ApiCheckRenameTagRequest,
  ): ApiCheckRenameTagResponse
  [WebAiApiCheckMessageTypes.RunProbe](
    data: ApiCheckRunProbeRequest,
  ): ApiCheckRunProbeResponse
  [WebAiApiCheckMessageTypes.RunPelican](
    data: ApiCheckRunPelicanRequest,
  ): ApiCheckRunPelicanResponse
  [WebAiApiCheckMessageTypes.CancelRunProbe](
    data: ApiCheckCancelRunProbeRequest,
  ): ApiCheckCancelRunProbeResponse
  [WebAiApiCheckMessageTypes.SaveProfile](
    data: ApiCheckSaveProfileRequest,
  ): ApiCheckSaveProfileResponse
}

export const {
  sendMessage: sendWebAiApiCheckMessage,
  onMessage: onWebAiApiCheckMessage,
} = defineExtensionMessaging<WebAiApiCheckProtocolMap>({
  logger: createWebAiApiCheckMessagingLogger(),
})
