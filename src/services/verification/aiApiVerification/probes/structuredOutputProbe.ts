import { Output } from "ai"
import { z } from "zod"

import { nowMs, okLatency } from "../probeTiming"
import { createModel } from "../providers"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "../types"
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

type RunStructuredOutputProbeParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
  abortSignal?: AbortSignal
}

const STRUCTURED_OUTPUT_PROMPT = "Return a JSON object with shape { ok: true }."

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

    const prompt = STRUCTURED_OUTPUT_PROMPT
    const { output } = await runProbeGeneration(params.apiType, {
      model,
      prompt,
      output: Output.object({
        schema: z.object({
          ok: z.literal(true),
        }),
      }),
      abortSignal: params.abortSignal,
    })

    return {
      id: API_VERIFICATION_PROBE_IDS.StructuredOutput,
      status:
        output?.ok === true
          ? API_VERIFICATION_PROBE_STATUSES.Pass
          : API_VERIFICATION_PROBE_STATUSES.Fail,
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
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)
    return {
      id: API_VERIFICATION_PROBE_IDS.StructuredOutput,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary,
      summaryKey: diagnostics.summaryKey,
      summaryParams: diagnostics.summaryParams,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt: STRUCTURED_OUTPUT_PROMPT,
        schema: { ok: true },
      },
      output: diagnostics.output,
    }
  }
}
