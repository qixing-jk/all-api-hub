import { runDecisionProbe } from "./probes/decisionProbe"
import { runEmbeddingProbe } from "./probes/embeddingProbe"
import { runImageGenerationProbe } from "./probes/imageGenerationProbe"
import { runModelsProbe } from "./probes/modelsProbe"
import { runRerankProbe } from "./probes/rerankProbe"
import { runStructuredOutputProbe } from "./probes/structuredOutputProbe"
import { runTextGenerationProbe } from "./probes/textGenerationProbe"
import { runToolCallingProbe } from "./probes/toolCallingProbe"
import { runVideoGenerationProbe } from "./probes/videoGenerationProbe"
import { runWebSearchProbe } from "./probes/webSearchProbe"
import {
  API_VERIFICATION_PROBE_IDS,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
  type ApiVerificationRequestProfile,
} from "./types"

/**
 * Input passed into a probe runner from the registry.
 */
type ProbeRunnerParams = {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  apiType: ApiVerificationApiType
  mode?: ApiVerificationMode
  modelId?: string
  abortSignal?: AbortSignal
}

/**
 * Registry entry for a probe runner with metadata about inputs.
 */
type ProbeRegistryEntry =
  | {
      requiresModelId: false
      run: (params: ProbeRunnerParams) => Promise<ApiVerificationProbeResult>
    }
  | {
      requiresModelId: true
      run: (
        params: ProbeRunnerParams & { modelId: string },
      ) => Promise<ApiVerificationProbeResult>
    }

/**
 * Typed registry for dispatching probe execution without conditional chains.
 */
export const apiVerificationProbeRegistry: Record<
  ApiVerificationProbeId,
  ProbeRegistryEntry
> = {
  [API_VERIFICATION_PROBE_IDS.Models]: {
    requiresModelId: false,
    run: async (params) => {
      return (
        await runModelsProbe({
          baseUrl: params.baseUrl,
          apiKey: params.apiKey,
          ...(params.requestHeaders
            ? { requestHeaders: params.requestHeaders }
            : {}),
          apiType: params.apiType,
          abortSignal: params.abortSignal,
        })
      ).result
    },
  },
  [API_VERIFICATION_PROBE_IDS.TextGeneration]: {
    requiresModelId: true,
    run: runTextGenerationProbe,
  },
  [API_VERIFICATION_PROBE_IDS.ToolCalling]: {
    requiresModelId: true,
    run: runToolCallingProbe,
  },
  [API_VERIFICATION_PROBE_IDS.StructuredOutput]: {
    requiresModelId: true,
    run: runStructuredOutputProbe,
  },
  [API_VERIFICATION_PROBE_IDS.WebSearch]: {
    requiresModelId: true,
    run: runWebSearchProbe,
  },
  [API_VERIFICATION_PROBE_IDS.Embedding]: {
    requiresModelId: true,
    run: runEmbeddingProbe,
  },
  [API_VERIFICATION_PROBE_IDS.Rerank]: {
    requiresModelId: true,
    run: runRerankProbe,
  },
  [API_VERIFICATION_PROBE_IDS.ImageGeneration]: {
    requiresModelId: true,
    run: runImageGenerationProbe,
  },
  [API_VERIFICATION_PROBE_IDS.VideoGeneration]: {
    requiresModelId: true,
    run: runVideoGenerationProbe,
  },
  [API_VERIFICATION_PROBE_IDS.Decision]: {
    requiresModelId: true,
    run: runDecisionProbe,
  },
}
