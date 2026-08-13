import { nowMs, okLatency } from "../probeTiming"
import { createModel } from "../providers"
import { API_VERIFICATION_PROBE_STATUSES } from "../types"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "../types"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "../utils"
import { runProbeGeneration } from "./probeGeneration"

type RunTextGenerationProbeParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
  abortSignal?: AbortSignal
}

/**
 * Baseline text generation probe for the selected API type.
 */
export async function runTextGenerationProbe(
  params: RunTextGenerationProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const secretsToRedact = [params.apiKey]

  try {
    const prompt = "Reply with exactly: OK"
    const model = createModel({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId: params.modelId,
    })

    const result = await runProbeGeneration(params.apiType, {
      model,
      prompt,
      abortSignal: params.abortSignal,
    })

    const text = (result.text ?? "").trim().toLowerCase()
    const ok = text === "ok" || text.includes("ok")

    return {
      id: "text-generation",
      status: ok
        ? API_VERIFICATION_PROBE_STATUSES.Pass
        : API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary: ok ? "Text generation succeeded" : "Unexpected response text",
      summaryKey: ok
        ? "verifyDialog.summaries.textGenerationSucceeded"
        : "verifyDialog.summaries.textGenerationUnexpectedResponse",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt,
      },
      output: {
        text: result.text ?? null,
      },
      details: ok
        ? undefined
        : { responsePreview: (result.text ?? "").slice(0, 80) },
    }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)

    return {
      id: "text-generation",
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary,
      summaryKey: diagnostics.summaryKey,
      summaryParams: diagnostics.summaryParams,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt: "Reply with exactly: OK",
      },
      output: diagnostics.output,
    }
  }
}
