import {
  generateText,
  streamText,
  type GenerateTextResult,
  type Output,
  type ToolSet,
} from "ai"

import { API_VERIFICATION_MODES, type ApiVerificationMode } from "../types"

type ProbeGenerationResult<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
> = Pick<
  GenerateTextResult<TOOLS, Record<string, unknown>, OUTPUT>,
  "text" | "toolCalls" | "toolResults" | "sources"
> & {
  output?: GenerateTextResult<TOOLS, Record<string, unknown>, OUTPUT>["output"]
}

/**
 * Run exactly the selected generation mode and aggregate streaming results.
 * Mode failures remain visible so a test never silently verifies another mode.
 */
export async function runProbeGeneration<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
>(
  options: Parameters<
    typeof generateText<TOOLS, Record<string, unknown>, OUTPUT>
  >[0],
  mode: ApiVerificationMode = API_VERIFICATION_MODES.Streaming,
): Promise<ProbeGenerationResult<TOOLS, OUTPUT>> {
  options.abortSignal?.throwIfAborted()

  if (mode === API_VERIFICATION_MODES.NonStreaming) {
    try {
      const result = await generateText(options)
      options.abortSignal?.throwIfAborted()
      return {
        // The SDK's default output getter throws for a tool-only final turn.
        // Only structured-output probes require that getter to be evaluated.
        output: options.output ? result.output : undefined,
        text: result.text,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        sources: result.sources,
      }
    } catch (error) {
      options.abortSignal?.throwIfAborted()
      throw error
    }
  }

  let hasStreamError = false
  let streamError: unknown
  const result = streamText({
    ...options,
    // Probe failures are caught and sanitized by the caller.
    onError: ({ error }) => {
      hasStreamError = true
      streamError = error
    },
  })
  try {
    const [output, text, toolCalls, toolResults, sources, finishReason] =
      await Promise.all([
        options.output ? result.output : undefined,
        result.text,
        result.toolCalls,
        result.toolResults,
        result.sources,
        result.finishReason,
      ])

    options.abortSignal?.throwIfAborted()
    if (hasStreamError || finishReason === "error") {
      throw streamError ?? new Error("AI generation stream failed")
    }

    return { output, text, toolCalls, toolResults, sources }
  } catch (error) {
    options.abortSignal?.throwIfAborted()
    // The SDK's aggregate output may reject with NoOutputGeneratedError before
    // the caller can inspect the provider failure captured by onError.
    throw streamError ?? error
  }
}
