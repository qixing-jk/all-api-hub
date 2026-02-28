import { generateText } from "ai"

import { nowMs, okLatency } from "../probeTiming"
import { createModel } from "../providers"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "../types"
import { toSanitizedErrorSummary } from "../utils"

type RunTextGenerationProbeParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
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

    const result = await generateText({
      model,
      prompt,
    })

    const text = (result.text ?? "").trim().toLowerCase()
    const ok = text === "ok" || text.includes("ok")

    return {
      id: "text-generation",
      status: ok ? "pass" : "fail",
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
    return {
      id: "text-generation",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary: toSanitizedErrorSummary(error, secretsToRedact),
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt: "Reply with exactly: OK",
      },
    }
  }
}
