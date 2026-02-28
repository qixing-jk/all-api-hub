import { API_TYPES } from "~/services/verification/aiApiVerification"

import { runCliToolCallingSimulation } from "./runners/toolCalling"
import type { CliSupportResult, CliToolId } from "./types"

/**
 * Inputs passed into a tool runner from the registry.
 */
export type CliToolRunnerParams = {
  baseUrl: string
  apiKey: string
  modelId?: string
}

type CliToolRegistryEntry = {
  run: (params: CliToolRunnerParams) => Promise<CliSupportResult>
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
  const entry = cliSupportToolRegistry[toolId]

  return entry.run(params)
}

const CLI_TOOL_CONFIG: Record<
  CliToolId,
  { apiType: (typeof API_TYPES)[keyof typeof API_TYPES]; endpointPath: string }
> = {
  claude: { apiType: API_TYPES.ANTHROPIC, endpointPath: "/v1/messages" },
  codex: {
    apiType: API_TYPES.OPENAI,
    endpointPath: "/v1/responses",
  },
  gemini: {
    apiType: API_TYPES.GOOGLE,
    endpointPath: "/v1beta/models/{model}:generateContent",
  },
}

/**
 * Typed registry for dispatching tool simulation execution without conditional chains.
 *
 * Each entry enforces:
 * - API family compatibility (unsupported => no request sent)
 * - Whether a model id is required
 */
export const cliSupportToolRegistry: Record<CliToolId, CliToolRegistryEntry> = {
  claude: {
    run: async (params) => {
      return runCliToolCallingSimulation({
        toolId: "claude",
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: CLI_TOOL_CONFIG.claude.apiType,
        modelId: params.modelId,
        endpointPath: CLI_TOOL_CONFIG.claude.endpointPath,
      })
    },
  },
  codex: {
    run: async (params) => {
      return runCliToolCallingSimulation({
        toolId: "codex",
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: CLI_TOOL_CONFIG.codex.apiType,
        modelId: params.modelId,
        endpointPath: CLI_TOOL_CONFIG.codex.endpointPath,
      })
    },
  },
  gemini: {
    run: async (params) => {
      return runCliToolCallingSimulation({
        toolId: "gemini",
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: CLI_TOOL_CONFIG.gemini.apiType,
        modelId: params.modelId,
        endpointPath: CLI_TOOL_CONFIG.gemini.endpointPath,
      })
    },
  },
}
