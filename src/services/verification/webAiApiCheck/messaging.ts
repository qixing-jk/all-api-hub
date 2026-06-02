import { defineExtensionMessaging, type Logger } from "@webext-core/messaging"

import { createLogger } from "~/utils/core/logger"

import type {
  ApiCheckFetchModelsRequest,
  ApiCheckFetchModelsResponse,
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
  RunProbe: "webAiApiCheck:runProbe",
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
  [WebAiApiCheckMessageTypes.RunProbe](
    data: ApiCheckRunProbeRequest,
  ): ApiCheckRunProbeResponse
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
