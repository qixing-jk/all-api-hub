import {
  generateText,
  streamText,
  type GenerateTextResult,
  type Output,
  type ToolSet,
} from "ai"

import { API_TYPES, type ApiVerificationApiType } from "../types"

type ProbeGenerationResult<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
> = Pick<
  GenerateTextResult<TOOLS, OUTPUT>,
  "output" | "text" | "toolCalls" | "toolResults"
>

/**
 * Run a generation probe using the response mode used by the target protocol.
 *
 * Claude Code and Anthropic-compatible coding endpoints primarily use SSE,
 * where thinking signatures can arrive separately from thinking blocks.
 * @see https://docs.anthropic.com/en/api/messages-streaming
 * @see https://github.com/vercel/ai/tree/main/packages/anthropic
 */
export async function runProbeGeneration<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
>(
  apiType: ApiVerificationApiType,
  options: Parameters<typeof generateText<TOOLS, OUTPUT>>[0],
): Promise<ProbeGenerationResult<TOOLS, OUTPUT>> {
  if (apiType !== API_TYPES.ANTHROPIC) {
    const result = await generateText(options)
    return {
      output: result.output,
      text: result.text,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
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
  const [output, text, toolCalls, toolResults, finishReason] =
    await Promise.all([
      result.output,
      result.text,
      result.toolCalls,
      result.toolResults,
      result.finishReason,
    ])

  if (hasStreamError || finishReason === "error") {
    throw streamError ?? new Error("AI generation stream failed")
  }

  return { output, text, toolCalls, toolResults }
}
