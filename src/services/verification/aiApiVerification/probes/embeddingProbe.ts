import { embed } from "ai"

import { nowMs, okLatency } from "../probeTiming"
import { createEmbeddingModel } from "../providers"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeResult,
} from "../types"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "../utils"
import { resolveProbePrompt } from "./probePrompts"
import type { ModelProbeParams } from "./probeTransport"

/**
 * Baseline embedding vector probe for the selected API type and model.
 */
export async function runEmbeddingProbe(
  params: ModelProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const secretsToRedact = [
    params.apiKey,
    ...Object.values(params.requestHeaders ?? {}),
  ]

  if (params.apiType === API_TYPES.ANTHROPIC) {
    return {
      id: API_VERIFICATION_PROBE_IDS.Embedding,
      status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
      latencyMs: okLatency(startedAt),
      summary: "Anthropic does not provide native embedding models",
      summaryKey: "verifyDialog.summaries.embeddingUnsupportedAnthropic",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
    }
  }

  try {
    const model = createEmbeddingModel({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      requestHeaders: params.requestHeaders,
      apiType: params.apiType,
      modelId: params.modelId,
    })

    const { embedding, usage } = await embed({
      model,
      value: resolveProbePrompt(
        API_VERIFICATION_PROBE_IDS.Embedding,
        params.probePromptOverrides,
      )!,
      abortSignal: params.abortSignal,
    })

    const dimension = Array.isArray(embedding) ? embedding.length : 0
    const ok = dimension > 0

    return {
      id: API_VERIFICATION_PROBE_IDS.Embedding,
      status: ok
        ? API_VERIFICATION_PROBE_STATUSES.Pass
        : API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary: ok
        ? `Embedding succeeded (${dimension} dimensions)`
        : "Unexpected embedding response",
      summaryKey: ok
        ? "verifyDialog.summaries.embeddingSucceeded"
        : "verifyDialog.summaries.embeddingUnexpectedResponse",
      summaryParams: { dimension },
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        input: resolveProbePrompt(
          API_VERIFICATION_PROBE_IDS.Embedding,
          params.probePromptOverrides,
        ),
      },
      output: {
        dimension,
        tokens: usage?.tokens,
      },
      details: ok ? { dimension, sample: embedding.slice(0, 5) } : undefined,
    }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)

    return {
      id: API_VERIFICATION_PROBE_IDS.Embedding,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary,
      summaryKey: diagnostics.summaryKey,
      summaryParams: diagnostics.summaryParams,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
      output: diagnostics.output,
    }
  }
}
