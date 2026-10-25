import { Output } from "ai"
import { z } from "zod"

import { nowMs, okLatency } from "../probeTiming"
import { createModel } from "../providers"
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "../types"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbePromptOverrides,
  ApiVerificationProbeResult,
  ApiVerificationRequestProfile,
} from "../types"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "../utils"
import { runProbeGeneration } from "./probeGeneration"
import { resolveProbePrompt } from "./probePrompts"

type RunStructuredOutputProbeParams = {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  apiType: ApiVerificationApiType
  modelId: string
  mode?: ApiVerificationMode
  probePromptOverrides?: ApiVerificationProbePromptOverrides
  abortSignal?: AbortSignal
}

/**
 * Structured output probe.
 */
export async function runStructuredOutputProbe(
  params: RunStructuredOutputProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const mode = params.mode ?? API_VERIFICATION_MODES.Streaming
  const secretsToRedact = [
    params.apiKey,
    ...Object.values(params.requestHeaders ?? {}),
  ]

  try {
    const model = createModel({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      ...(params.requestHeaders
        ? { requestHeaders: params.requestHeaders }
        : {}),
      apiType: params.apiType,
      requestProfile: params.requestProfile,
      requestProfileEnhanced: params.requestProfileEnhanced,
      modelId: params.modelId,
    })

    const prompt = resolveProbePrompt(
      API_VERIFICATION_PROBE_IDS.StructuredOutput,
      params.probePromptOverrides,
    )!
    const { output } = await runProbeGeneration(
      {
        model,
        prompt,
        output: Output.object({
          schema: z.object({
            ok: z.literal(true),
          }),
        }),
        abortSignal: params.abortSignal,
      },
      mode,
    )

    return {
      id: API_VERIFICATION_PROBE_IDS.StructuredOutput,
      mode,
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
      mode,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary,
      summaryKey: diagnostics.summaryKey,
      summaryParams: diagnostics.summaryParams,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt: resolveProbePrompt(
          API_VERIFICATION_PROBE_IDS.StructuredOutput,
          params.probePromptOverrides,
        ),
        schema: { ok: true },
      },
      output: diagnostics.output,
    }
  }
}
