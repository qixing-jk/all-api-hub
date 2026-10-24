import {
  API_TYPES,
  API_VERIFICATION_MODES,
  type ApiVerificationMode,
} from "~/services/verification/aiApiVerification"

import { runCliToolCallingSimulation } from "./runners/toolCalling"
import type { CliSupportResult, CliToolId } from "./types"

/**
 * Inputs passed into a tool runner from the registry.
 */
type CliToolRunnerParams = {
  baseUrl: string
  apiKey: string
  requestProfileEnhanced?: boolean
  requestHeaders?: Record<string, string>
  mode?: ApiVerificationMode
  modelId?: string
  abortSignal?: AbortSignal
}

/**
 * Run a tool simulation via the registry.
 *
 * Each tool uses a fixed API family/endpoint style internally, so callers do not
 * need to select or pass an API type.
 */
export async function runCliSupportToolFromRegistry(
  toolId: CliToolId,
  params: CliToolRunnerParams,
): Promise<CliSupportResult> {
  const config = CLI_TOOL_CONFIG[toolId]
  return runCliToolCallingSimulation({
    toolId,
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    ...(params.requestHeaders ? { requestHeaders: params.requestHeaders } : {}),
    ...(params.requestProfileEnhanced ? { requestProfileEnhanced: true } : {}),
    mode: params.mode,
    apiType: config.apiType,
    modelId: params.modelId,
    abortSignal: params.abortSignal,
    endpointPath:
      "streamingEndpointPath" in config &&
      params.mode !== API_VERIFICATION_MODES.NonStreaming
        ? config.streamingEndpointPath
        : config.endpointPath,
  })
}

const CLI_TOOL_CONFIG = {
  claude: { apiType: API_TYPES.ANTHROPIC, endpointPath: "/v1/messages" },
  codex: {
    apiType: API_TYPES.OPENAI,
    endpointPath: "/v1/responses",
  },
  gemini: {
    apiType: API_TYPES.GOOGLE,
    endpointPath: "/v1beta/models/{model}:generateContent",
    streamingEndpointPath: "/v1beta/models/{model}:streamGenerateContent",
  },
} as const satisfies Record<
  CliToolId,
  {
    apiType: (typeof API_TYPES)[keyof typeof API_TYPES]
    endpointPath: string
    streamingEndpointPath?: string
  }
>
