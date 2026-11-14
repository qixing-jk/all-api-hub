import {
  generateText,
  streamText,
  type GenerateTextResult,
  type Output,
  type ToolSet,
} from "ai"

import {
  getGenerationMetrics,
  type VerificationGenerationMetrics,
} from "../generationMetrics"
import type { VerificationProgressCallback } from "../generationProgress"
import { createGenerationTrace } from "../generationTrace"
import { API_VERIFICATION_MODES, type ApiVerificationMode } from "../types"

type ProbeGenerationResult<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
> = Pick<
  GenerateTextResult<TOOLS, Record<string, unknown>, OUTPUT>,
  | "text"
  | "toolCalls"
  | "toolResults"
  | "sources"
  | "usage"
  | "finishReason"
  | "rawFinishReason"
> & {
  metrics?: VerificationGenerationMetrics[]
  output?: GenerateTextResult<TOOLS, Record<string, unknown>, OUTPUT>["output"]
}

type ProbeGenerationOptions<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
> = Parameters<typeof generateText<TOOLS, Record<string, unknown>, OUTPUT>>[0] &
  Pick<
    Parameters<typeof streamText<TOOLS, Record<string, unknown>, OUTPUT>>[0],
    "include" | "onChunk"
  > & { onProgress?: VerificationProgressCallback }

/**
 * Run exactly the selected generation mode and aggregate streaming results.
 * Mode failures remain visible so a test never silently verifies another mode.
 */
export async function runProbeGeneration<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
>(
  options: ProbeGenerationOptions<TOOLS, OUTPUT>,
  mode: ApiVerificationMode = API_VERIFICATION_MODES.Streaming,
): Promise<ProbeGenerationResult<TOOLS, OUTPUT>> {
  options.abortSignal?.throwIfAborted()
  const { onProgress, ...rest } = options
  // Rest destructuring cannot retain the SDK's conditional tool-context type.
  const generationOptions = rest as typeof options
  return mode === API_VERIFICATION_MODES.NonStreaming
    ? runNonStreamingProbeGeneration(options, generationOptions, onProgress)
    : runStreamingProbeGeneration(options, generationOptions, onProgress)
}

/** Preserve step callbacks and aggregate evidence for a non-streaming request. */
async function runNonStreamingProbeGeneration<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
>(
  options: ProbeGenerationOptions<TOOLS, OUTPUT>,
  generationOptions: ProbeGenerationOptions<TOOLS, OUTPUT>,
  onProgress?: VerificationProgressCallback,
): Promise<ProbeGenerationResult<TOOLS, OUTPUT>> {
  const trace = createGenerationTrace()
  let completedSteps = 0
  const publish = (
    metrics?: VerificationGenerationMetrics[],
    text?: string,
  ) => {
    if (!options.abortSignal?.aborted)
      onProgress?.({
        ...trace.snapshot(),
        ...(text !== undefined ? { text } : {}),
        metrics,
      })
  }
  try {
    const result = await generateText({
      ...generationOptions,
      onStepEnd: async (step) => {
        trace.addStep(step.content ?? [])
        completedSteps++
        publish()
        await generationOptions.onStepEnd?.(step)
      },
    })
    options.abortSignal?.throwIfAborted()
    for (const step of (result.steps ?? []).slice(completedSteps))
      trace.addStep(step.content ?? [])
    publish(getGenerationMetrics(result.steps), result.text ?? "")
    return {
      // The SDK's default output getter throws for a tool-only final turn.
      // Only structured-output probes require that getter to be evaluated.
      output: options.output ? result.output : undefined,
      text: result.text,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      sources: result.sources,
      usage: result.usage,
      finishReason: result.finishReason,
      rawFinishReason: result.rawFinishReason,
      metrics: getGenerationMetrics(result.steps),
    }
  } catch (error) {
    options.abortSignal?.throwIfAborted()
    trace.fail(error)
    publish()
    throw error
  }
}

/** Consume transient chunks before accepting the complete stream aggregate. */
async function runStreamingProbeGeneration<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
>(
  options: ProbeGenerationOptions<TOOLS, OUTPUT>,
  generationOptions: ProbeGenerationOptions<TOOLS, OUTPUT>,
  onProgress?: VerificationProgressCallback,
): Promise<ProbeGenerationResult<TOOLS, OUTPUT>> {
  let hasStreamError = false
  const trace = createGenerationTrace()
  let streamError: unknown
  let metrics: VerificationGenerationMetrics[] | undefined
  const publish = () => {
    if (!options.abortSignal?.aborted)
      onProgress?.({ ...trace.snapshot(), metrics })
  }
  const result = streamText({
    ...generationOptions,
    onChunk: async (event) => {
      const { chunk } = event
      trace.consume(chunk)
      publish()
      await generationOptions.onChunk?.(event)
    },
    // Probe failures are caught and sanitized by the caller.
    onError: ({ error }) => {
      hasStreamError = true
      streamError = error
      trace.fail(error)
      publish()
    },
  })
  try {
    const [
      output,
      text,
      toolCalls,
      toolResults,
      sources,
      finishReason,
      usage,
      rawFinishReason,
      steps,
    ] = await Promise.all([
      options.output ? result.output : undefined,
      result.text,
      result.toolCalls,
      result.toolResults,
      result.sources,
      result.finishReason,
      result.usage,
      result.rawFinishReason,
      result.steps,
    ])

    options.abortSignal?.throwIfAborted()
    metrics = getGenerationMetrics(steps)
    publish()
    // The SDK preserves partial output for interrupted streams without onError.
    // A probe must receive a complete response before treating it as success.
    if (
      hasStreamError ||
      finishReason === "error" ||
      finishReason === "interrupted"
    ) {
      throw streamError ?? new Error("AI generation stream failed")
    }

    return {
      output,
      text,
      toolCalls,
      toolResults,
      sources,
      finishReason,
      usage,
      rawFinishReason,
      metrics: getGenerationMetrics(steps),
    }
  } catch (error) {
    options.abortSignal?.throwIfAborted()
    // The SDK's aggregate output may reject with NoOutputGeneratedError before
    // the caller can inspect the provider failure captured by onError.
    throw streamError ?? error
  }
}
