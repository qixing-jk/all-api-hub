import type { ContentPart, TextStreamPart, ToolSet } from "ai"

import {
  VERIFICATION_GENERATION_PART_TYPES,
  VERIFICATION_GENERATION_TOOL_STATES,
} from "~/services/verification/aiApiVerification/generationProgress"

import type {
  VerificationGenerationContent,
  VerificationGenerationPart,
  VerificationGenerationProgress,
} from "./generationProgress"
import { toSanitizedErrorSummary } from "./utils"

/** Exact SDK stream discriminants; display part types remain a separate contract. */
export const SDK_GENERATION_CHUNK_TYPES = {
  StartStep: "start-step",
  TextDelta: "text-delta",
  ReasoningDelta: "reasoning-delta",
  ToolInputStart: "tool-input-start",
  ToolInputDelta: "tool-input-delta",
  ToolCall: "tool-call",
  ToolResult: "tool-result",
  ToolError: "tool-error",
} as const

/** Collect ordered display blocks while preserving the SDK's call identities. */
export function createGenerationTrace() {
  const parts: VerificationGenerationPart[] = []
  let step = 1
  let started = false
  const append = (part: VerificationGenerationContent) => {
    const next = { ...part, id: String(parts.length), step }
    parts.push(next)
    return next
  }
  const consume = (chunk: TextStreamPart<ToolSet>) => {
    if (chunk.type === SDK_GENERATION_CHUNK_TYPES.StartStep) {
      if (started || parts.length) step++
      started = true
    } else if (
      chunk.type === SDK_GENERATION_CHUNK_TYPES.TextDelta ||
      chunk.type === SDK_GENERATION_CHUNK_TYPES.ReasoningDelta
    ) {
      const type =
        chunk.type === SDK_GENERATION_CHUNK_TYPES.TextDelta
          ? VERIFICATION_GENERATION_PART_TYPES.Text
          : VERIFICATION_GENERATION_PART_TYPES.Reasoning
      const last = parts.at(-1)
      if (last?.type === type && last.step === step) last.text += chunk.text
      else append({ type, text: chunk.text })
    } else if (
      chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolInputStart ||
      chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolInputDelta ||
      chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolCall ||
      chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolResult ||
      chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolError
    ) {
      const callId = "toolCallId" in chunk ? chunk.toolCallId : chunk.id
      let part = parts.find(
        (part) =>
          part.type === VERIFICATION_GENERATION_PART_TYPES.Tool &&
          part.toolCallId === callId,
      )
      if (!part && "toolName" in chunk) {
        part = append({
          type: VERIFICATION_GENERATION_PART_TYPES.Tool,
          toolCallId: callId,
          name: chunk.toolName,
          input: "",
          state: VERIFICATION_GENERATION_TOOL_STATES.InputStreaming,
        })
      }
      if (part?.type !== VERIFICATION_GENERATION_PART_TYPES.Tool) return
      if (chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolInputDelta)
        part.input += chunk.delta
      else if (chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolCall) {
        part.input = JSON.stringify(chunk.input) ?? ""
        part.state = VERIFICATION_GENERATION_TOOL_STATES.InputAvailable
      } else if (chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolResult) {
        part.output = JSON.stringify(chunk.output) ?? ""
        part.state = chunk.preliminary
          ? VERIFICATION_GENERATION_TOOL_STATES.InputAvailable
          : VERIFICATION_GENERATION_TOOL_STATES.OutputAvailable
      } else if (chunk.type === SDK_GENERATION_CHUNK_TYPES.ToolError) {
        part.output = toSanitizedErrorSummary(chunk.error, [])
        part.state = VERIFICATION_GENERATION_TOOL_STATES.OutputError
      }
    }
  }
  const addStep = (content: ContentPart<ToolSet>[]) => {
    if (started || parts.length) step++
    started = true
    for (const part of content) {
      if (
        part.type === VERIFICATION_GENERATION_PART_TYPES.Text ||
        part.type === VERIFICATION_GENERATION_PART_TYPES.Reasoning
      )
        append({ type: part.type, text: part.text })
      else if (
        part.type === SDK_GENERATION_CHUNK_TYPES.ToolCall ||
        part.type === SDK_GENERATION_CHUNK_TYPES.ToolResult ||
        part.type === SDK_GENERATION_CHUNK_TYPES.ToolError
      )
        consume(part)
    }
  }
  return {
    consume,
    addStep,
    fail: (error: unknown) =>
      append({
        type: VERIFICATION_GENERATION_PART_TYPES.Error,
        text: toSanitizedErrorSummary(error, []),
      }),
    snapshot: (): VerificationGenerationProgress => ({
      text: parts
        .filter((part) => part.type === VERIFICATION_GENERATION_PART_TYPES.Text)
        .map((part) => part.text)
        .join("\n\n"),
      reasoning: parts
        .filter(
          (part) => part.type === VERIFICATION_GENERATION_PART_TYPES.Reasoning,
        )
        .map((part) => part.text)
        .join("\n\n"),
      tools: parts
        .filter((part) => part.type === VERIFICATION_GENERATION_PART_TYPES.Tool)
        .map((part) => ({
          id: part.toolCallId,
          name: part.name,
          input: part.input,
          ...(part.state === VERIFICATION_GENERATION_TOOL_STATES.OutputAvailable
            ? { complete: true }
            : {}),
        })),
      step,
      parts: parts.map((part) => ({ ...part })),
    }),
  }
}
