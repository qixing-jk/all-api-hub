import type { VerificationGenerationMetrics } from "./generationMetrics"
import { toSanitizedErrorSummary } from "./utils"

export const VERIFICATION_GENERATION_PART_TYPES = {
  Text: "text",
  Reasoning: "reasoning",
  Tool: "tool",
  Error: "error",
} as const

export const VERIFICATION_GENERATION_TOOL_STATES = {
  InputStreaming: "input-streaming",
  InputAvailable: "input-available",
  OutputAvailable: "output-available",
  OutputError: "output-error",
} as const

export type VerificationGenerationToolState =
  (typeof VERIFICATION_GENERATION_TOOL_STATES)[keyof typeof VERIFICATION_GENERATION_TOOL_STATES]

export type VerificationGenerationContent =
  | { type: typeof VERIFICATION_GENERATION_PART_TYPES.Text; text: string }
  | { type: typeof VERIFICATION_GENERATION_PART_TYPES.Reasoning; text: string }
  | {
      type: typeof VERIFICATION_GENERATION_PART_TYPES.Tool
      toolCallId: string
      name: string
      input: string
      output?: string
      state: VerificationGenerationToolState
    }
  | { type: typeof VERIFICATION_GENERATION_PART_TYPES.Error; text: string }

export type VerificationGenerationPart = VerificationGenerationContent & {
  id: string
  step: number
}

/** Transient display state; final probe success is determined separately. */
export type VerificationGenerationProgress = {
  text: string
  reasoning: string
  tools: { id: string; name: string; input: string; complete?: boolean }[]
  step: number
  /** Blocks in first-observed order; tool results update the matching call. */
  parts?: VerificationGenerationPart[]
  metrics?: VerificationGenerationMetrics[]
}
export type VerificationProgressCallback = (
  progress: VerificationGenerationProgress,
) => void

/** Keep transient provider output subject to the same credential redaction as errors. */
export function createSafeGenerationProgressCallback(
  callback: VerificationProgressCallback | undefined,
  secrets: string[],
): VerificationProgressCallback | undefined {
  if (!callback) return undefined
  const clean = (text: string) => toSanitizedErrorSummary(text, secrets)
  return (progress) =>
    callback({
      ...progress,
      text: clean(progress.text),
      reasoning: clean(progress.reasoning),
      tools: progress.tools.map((tool) => ({
        ...tool,
        name: clean(tool.name),
        input: clean(tool.input),
      })),
      ...(progress.parts
        ? {
            parts: progress.parts.map((part) =>
              part.type === VERIFICATION_GENERATION_PART_TYPES.Tool
                ? {
                    ...part,
                    name: clean(part.name),
                    input: clean(part.input),
                    ...(part.output !== undefined
                      ? { output: clean(part.output) }
                      : {}),
                  }
                : { ...part, text: clean(part.text) },
            ),
          }
        : {}),
    })
}
