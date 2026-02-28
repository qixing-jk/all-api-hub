import { generateText, Output } from "ai"
import { z } from "zod"

import { nowMs, okLatency } from "../probeTiming"
import { createModel } from "../providers"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "../types"
import { toSanitizedErrorSummary } from "../utils"

type RunStructuredOutputProbeParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
}

/**
 * Structured output probe.
 */
export async function runStructuredOutputProbe(
  params: RunStructuredOutputProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const secretsToRedact = [params.apiKey]

  try {
    const model = createModel({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId: params.modelId,
    })

    const prompt = "Return a JSON object with shape { ok: true }."
    const { output } = await generateText({
      model,
      prompt,
      output: Output.object({
        schema: z.object({
          ok: z.literal(true),
        }),
      }),
    })

    return {
      id: "structured-output",
      status: output?.ok === true ? "pass" : "fail",
      latencyMs: okLatency(startedAt),
      summary:
        output?.ok === true ? "Structured output succeeded" : "Invalid output",
      summaryKey:
        output?.ok === true
          ? "verifyDialog.summaries.structuredOutputSucceeded"
          : "verifyDialog.summaries.structuredOutputInvalid",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt,
        schema: { ok: true },
      },
      output: {
        output: output ?? null,
      },
    }
  } catch (error) {
    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    return {
      id: "structured-output",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt: "Return a JSON object with shape { ok: true }.",
        schema: { ok: true },
      },
    }
  }
}
