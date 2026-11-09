import { classifyProviderFailure } from "@opencode/ai/route"
import { APICallError, StreamProviderError } from "ai"

import type { ContextAttemptOutcome } from "./contextCapacity"
import { CONTEXT_ATTEMPT_OUTCOMES } from "./contextCapacityConstants"

/** Adapt provider failures without treating arbitrary runtime errors as capacity evidence. */
export function classifyContextError(error: unknown): ContextAttemptOutcome {
  if (!APICallError.isInstance(error) && !StreamProviderError.isInstance(error))
    return CONTEXT_ATTEMPT_OUTCOMES.Inconclusive

  const reason = classifyProviderFailure({
    message: error.message,
    status: error.statusCode,
    ...(APICallError.isInstance(error)
      ? { rawBody: error.responseBody, data: error.data }
      : {
          // The SDK retains the parsed provider payload after SSE has started.
          rawBody: JSON.stringify(error.data),
          data: { error: { code: error.code, type: error.type } },
        }),
  })
  return reason._tag === "InvalidRequest" &&
    reason.classification === "context-overflow"
    ? CONTEXT_ATTEMPT_OUTCOMES.ContextLimit
    : CONTEXT_ATTEMPT_OUTCOMES.Inconclusive
}
