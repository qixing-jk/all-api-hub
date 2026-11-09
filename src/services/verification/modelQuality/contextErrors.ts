import { APICallError, StreamProviderError } from "ai"

import type { ContextAttemptOutcome } from "./contextCapacity"
import { CONTEXT_ATTEMPT_OUTCOMES } from "./contextCapacityConstants"

/** Only structured input validation errors with explicit capacity evidence qualify. */
export function classifyContextError(error: unknown): ContextAttemptOutcome {
  if (
    (!APICallError.isInstance(error) &&
      !StreamProviderError.isInstance(error)) ||
    ![400, 422].includes(error.statusCode ?? 0)
  )
    return CONTEXT_ATTEMPT_OUTCOMES.Inconclusive
  // Errors sent after streaming starts use a different SDK error class.
  const evidence = `${error.message} ${APICallError.isInstance(error) ? error.responseBody ?? "" : error.code ?? ""}`
  return /context_length_exceeded|maximum context length.{0,160}(?:exceed|resulted in|requested)|context window.{0,60}exceed|exceed.{0,40}context (?:window|limit)|(?:input length|input tokens|input token count).{0,80}exceed.{0,40}(?:context|token limit|maximum number of tokens)|prompt is too long/i.test(
    evidence,
  )
    ? CONTEXT_ATTEMPT_OUTCOMES.ContextLimit
    : CONTEXT_ATTEMPT_OUTCOMES.Inconclusive
}
