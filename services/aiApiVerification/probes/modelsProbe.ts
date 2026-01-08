import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"

import { nowMs, okLatency } from "../probeTiming"
import type { ApiVerificationProbeResult } from "../types"
import { toSanitizedErrorSummary } from "../utils"

type RunModelsProbeParams = {
  baseUrl: string
  apiKey: string
}

/**
 * Probe `/v1/models` reachability and parseability and return the first model id.
 */
export async function runModelsProbe(
  params: RunModelsProbeParams,
): Promise<{ result: ApiVerificationProbeResult; modelId?: string }> {
  const startedAt = nowMs()
  try {
    const modelIds = await fetchOpenAICompatibleModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })

    const firstModelId = modelIds.find(
      (id) => typeof id === "string" && id.trim(),
    )

    return {
      modelId: firstModelId,
      result: {
        id: "models",
        status: modelIds.length > 0 ? "pass" : "fail",
        latencyMs: okLatency(startedAt),
        summary:
          modelIds.length > 0
            ? `Fetched ${modelIds.length} models`
            : "No models returned",
        summaryKey:
          modelIds.length > 0
            ? "verifyDialog.summaries.modelsFetched"
            : "verifyDialog.summaries.noModelsReturned",
        summaryParams: modelIds.length > 0 ? { count: modelIds.length } : {},
        input: {
          endpoint: "/v1/models",
          baseUrl: params.baseUrl,
        },
        output: {
          modelCount: modelIds.length,
          suggestedModelId: firstModelId ?? null,
          modelIdsPreview: modelIds.slice(0, 20),
        },
        details:
          modelIds.length > 0 ? { modelCount: modelIds.length } : undefined,
      },
    }
  } catch (error) {
    return {
      result: {
        id: "models",
        status: "fail",
        latencyMs: okLatency(startedAt),
        summary: toSanitizedErrorSummary(error, [params.apiKey]),
        input: {
          endpoint: "/v1/models",
          baseUrl: params.baseUrl,
        },
      },
    }
  }
}
