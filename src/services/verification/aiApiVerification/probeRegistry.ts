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

/**
 * Input passed into a probe runner from the registry.
 */
type ProbeRunnerParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId?: string
  abortSignal?: AbortSignal
}

/**
 * Registry entry for a probe runner with metadata about inputs.
 */
type ProbeRegistryEntry = {
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
      return (
        await runModelsProbe({
          baseUrl: params.baseUrl,
          apiKey: params.apiKey,
          apiType: params.apiType,
          abortSignal: params.abortSignal,
        })
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
        abortSignal: params.abortSignal,
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
        abortSignal: params.abortSignal,
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
        abortSignal: params.abortSignal,
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
        abortSignal: params.abortSignal,
      }),
  },
}
