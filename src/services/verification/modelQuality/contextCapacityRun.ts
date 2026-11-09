import { modelMetadataService } from "~/services/models/modelMetadata"
import { API_VERIFICATION_MODES } from "~/services/verification/aiApiVerification/types"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/types"
import {
  isRequestTimeoutError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import {
  CONTEXT_ATTEMPT_FAILURE_REASONS,
  CONTEXT_ATTEMPT_OUTCOMES,
} from "~/services/verification/modelQuality/contextCapacityConstants"

import {
  probeContextCapacity,
  type ContextCapacityResult,
} from "./contextCapacity"
import { CONTEXT_CAPACITY_DEFAULTS as defaults } from "./contextCapacityDefaults"
import { createContextCounter } from "./contextCounter"
import { classifyContextError } from "./contextErrors"
import { runContextGeneration } from "./contextGeneration"
import { getDeclaredInputLimit } from "./contextLimits"
import type { ContextCounterInfo } from "./contextTokens"

export type RunContextCapacityParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
  requestHeaders?: Record<string, string>
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  mode?: ApiVerificationMode
  maxInputTokens?: number
  resumeFrom?: ContextCapacityRunResult
  abortSignal: AbortSignal
  onProgress?: (result: ContextCapacityResult) => void
  onCheckpoint?: (checkpoint: ContextCapacityCheckpoint) => Promise<void>
}

export type ContextCapacityCheckpoint = {
  result: ContextCapacityRunResult
  inFlightTarget?: number
}

export type ContextCapacityRunResult = ContextCapacityResult & {
  latencyMs?: number
  mode?: ApiVerificationMode
  counter: ContextCounterInfo
  inputLimit?: number
}

/** Use the selected credential and protocol; never retry or silently switch modes. */
export async function runContextCapacity(
  params: RunContextCapacityParams,
): Promise<ContextCapacityRunResult> {
  const startedAt = performance.now()
  if (
    params.maxInputTokens !== undefined &&
    (!Number.isSafeInteger(params.maxInputTokens) ||
      params.maxInputTokens < defaults.minimumInputTokens ||
      params.maxInputTokens > defaults.maxTotalInputTokens)
  )
    throw new Error("Invalid input limit")
  params.abortSignal.throwIfAborted()
  await modelMetadataService.initialize()
  params.abortSignal.throwIfAborted()
  const counter = await createContextCounter(
    modelMetadataService.resolveModelIdentity(params.modelId),
  )
  params.abortSignal.throwIfAborted()
  const maxOutputTokens = defaults.maxOutputTokens
  // Declarations guide the first request, never establish a measured boundary.
  const declaredInputLimit = getDeclaredInputLimit(
    counter.info,
    maxOutputTokens,
  )
  const requestedInputLimit =
    params.resumeFrom?.inputLimit ??
    params.maxInputTokens ??
    Math.min(
      defaults.maxTotalInputTokens,
      counter.maxInputTokens,
      Math.max(
        defaults.minimumInputTokens,
        declaredInputLimit ?? defaults.unknownInputTokens,
      ),
    )
  if (
    !Number.isSafeInteger(requestedInputLimit) ||
    requestedInputLimit < defaults.minimumInputTokens ||
    requestedInputLimit > defaults.maxTotalInputTokens
  )
    throw new Error("Invalid capacity continuation limit")
  const inputLimit = Math.min(requestedInputLimit, counter.maxInputTokens)
  if (
    params.resumeFrom &&
    JSON.stringify(params.resumeFrom.counter) !== JSON.stringify(counter.info)
  )
    throw new Error("Model token counter changed; start a new context test")
  const result = await probeContextCapacity({
    maxInputTokens: inputLimit,
    resumeFrom: params.resumeFrom,
    signal: params.abortSignal,
    beforeAttempt: async (inFlightTarget, result) => {
      await params.onCheckpoint?.({
        result: {
          ...result,
          counter: counter.info,
          inputLimit,
          mode: params.mode,
        },
        inFlightTarget,
      })
    },
    onProgress: async (result) => {
      await params.onCheckpoint?.({
        result: {
          ...result,
          counter: counter.info,
          inputLimit,
          mode: params.mode,
        },
      })
      params.onProgress?.(result)
    },
    attempt: async (targetTokens) => {
      const { prompt, inputTokens: localInputTokens } =
        await counter.preparePrompt(targetTokens, params.abortSignal)
      if (new TextEncoder().encode(prompt).byteLength > defaults.maxPromptBytes)
        return {
          outcome: CONTEXT_ATTEMPT_OUTCOMES.Inconclusive,
          message: "Test input exceeds the 32 MiB request limit",
        }
      try {
        const generation = await runContextGeneration(
          params,
          {
            prompt,
            maxOutputTokens,
            abortSignal: params.abortSignal,
          },
          params.mode,
        )
        if (params.abortSignal.aborted)
          return { outcome: CONTEXT_ATTEMPT_OUTCOMES.Inconclusive }
        const hasText = generation.text.trim().length > 0
        const reportedInput = generation.usage?.inputTokens
        // A length-limited response can have only reasoning tokens. Positive
        // reported input usage still proves acceptance, not a completed answer.
        const accepted =
          (generation.finishReason === "stop" && hasText) ||
          (generation.finishReason === "length" &&
            (hasText ||
              (Number.isSafeInteger(reportedInput) && reportedInput! > 0)))
        return {
          outcome: accepted
            ? CONTEXT_ATTEMPT_OUTCOMES.Accepted
            : CONTEXT_ATTEMPT_OUTCOMES.Inconclusive,
          finishReason: generation.finishReason,
          localInputTokens,
          inputTokens: generation.usage?.inputTokens,
          outputTokens: generation.usage?.outputTokens,
        }
      } catch (error) {
        return {
          outcome: classifyContextError(error),
          ...(isRequestTimeoutError(error)
            ? { failureReason: CONTEXT_ATTEMPT_FAILURE_REASONS.Timeout }
            : {}),
          localInputTokens,
          message: toSanitizedErrorSummary(error, [
            params.apiKey,
            ...Object.values(params.requestHeaders ?? {}),
          ]),
        }
      }
    },
  })
  return {
    ...result,
    counter: counter.info,
    inputLimit,
    latencyMs: performance.now() - startedAt,
    mode: params.mode ?? API_VERIFICATION_MODES.Streaming,
  }
}
