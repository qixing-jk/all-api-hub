import { MAX_CONTEXT_PROMPT_BYTES } from "./contextLimits"

/** Internal limits for one explicitly started or continued capacity-test batch. */
export const CONTEXT_CAPACITY_DEFAULTS = {
  minimumInputTokens: 1024,
  maxContinuationAttempts: 2048,
  unknownInputTokens: 1048576,
  resolutionTokens: 1024,
  maxRequests: 32,
  maxTotalInputTokens: 8388608,
  maxOutputTokens: 128,
  maxPromptBytes: MAX_CONTEXT_PROMPT_BYTES,
} as const
