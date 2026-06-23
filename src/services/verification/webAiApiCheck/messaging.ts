import {
  defineExtensionMessaging,
  type Logger,
} from "~/services/runtimeMessaging/extensionMessaging"
import { createLogger } from "~/utils/core/logger"

import type {
  ApiCheckCancelRunProbeRequest,
  ApiCheckCancelRunProbeResponse,
  ApiCheckFetchModelsRequest,
  ApiCheckFetchModelsResponse,
  ApiCheckGetBaseUrlHistorySuggestionsRequest,
  ApiCheckGetBaseUrlHistorySuggestionsResponse,
  ApiCheckRecordBaseUrlHistoryRequest,
  ApiCheckRecordBaseUrlHistoryResponse,
  ApiCheckRemoveBaseUrlHistoryRequest,
  ApiCheckRemoveBaseUrlHistoryResponse,
  ApiCheckRunProbeRequest,
  ApiCheckRunProbeResponse,
  ApiCheckSaveProfileRequest,
  ApiCheckSaveProfileResponse,
  ApiCheckShouldPromptRequest,
  ApiCheckShouldPromptResponse,
} from "./types"

export const WebAiApiCheckMessageTypes = {
  ShouldPrompt: "webAiApiCheck:shouldPrompt",
  FetchModels: "webAiApiCheck:fetchModels",
  GetBaseUrlHistorySuggestions: "webAiApiCheck:getBaseUrlHistorySuggestions",
  RecordBaseUrlHistory: "webAiApiCheck:recordBaseUrlHistory",
  RemoveBaseUrlHistory: "webAiApiCheck:removeBaseUrlHistory",
  RunProbe: "webAiApiCheck:runProbe",
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
  [WebAiApiCheckMessageTypes.RunProbe](
    data: ApiCheckRunProbeRequest,
  ): ApiCheckRunProbeResponse
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
