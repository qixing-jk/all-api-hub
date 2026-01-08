import { runModelsProbe } from "./probes/modelsProbe"
import { runStructuredOutputProbe } from "./probes/structuredOutputProbe"
import { runTextGenerationProbe } from "./probes/textGenerationProbe"
import { runToolCallingProbe } from "./probes/toolCallingProbe"
import { runWebSearchProbe } from "./probes/webSearchProbe"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "./types"
import { API_TYPES } from "./types"

/**
 * Input passed into a probe runner from the registry.
 */
export type ProbeRunnerParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId?: string
}

/**
 * Registry entry for a probe runner with metadata about inputs.
 */
export type ProbeRegistryEntry = {
  requiresModelId: boolean
  run: (params: ProbeRunnerParams) => Promise<ApiVerificationProbeResult>
}

/**
 * Typed registry for dispatching probe execution without conditional chains.
 */
export const apiVerificationProbeRegistry: Record<
  ApiVerificationProbeId,
  ProbeRegistryEntry
> = {
  models: {
    requiresModelId: false,
    run: async (params) => {
      // Models probe is only valid for OpenAI-compatible APIs.
      if (params.apiType !== API_TYPES.OPENAI_COMPATIBLE) {
        return {
          id: "models",
          status: "unsupported",
          latencyMs: 0,
          summary: "Models probe is only supported for OpenAI-compatible APIs",
          summaryKey: "verifyDialog.summaries.modelsProbeUnsupportedForApiType",
          input: {
            apiType: params.apiType,
            baseUrl: params.baseUrl,
            endpoint: "/v1/models",
          },
        }
      }

      return (
        await runModelsProbe({ baseUrl: params.baseUrl, apiKey: params.apiKey })
      ).result
    },
  },
  "text-generation": {
    requiresModelId: true,
    run: async (params) =>
      runTextGenerationProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: params.modelId as string,
      }),
  },
  "tool-calling": {
    requiresModelId: true,
    run: async (params) =>
      runToolCallingProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: params.modelId as string,
      }),
  },
  "structured-output": {
    requiresModelId: true,
    run: async (params) =>
      runStructuredOutputProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: params.modelId as string,
      }),
  },
  "web-search": {
    requiresModelId: true,
    run: async (params) =>
      runWebSearchProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: params.modelId as string,
      }),
  },
}
