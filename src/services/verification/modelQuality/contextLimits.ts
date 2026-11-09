import type { ContextCounterInfo } from "./contextTokens"

export const MAX_CONTEXT_PROMPT_BYTES = 33554432

/** Declared input and total-context limits are distinct; reserve output only from the latter. */
export function getDeclaredInputLimit(
  counter: ContextCounterInfo,
  outputTokens: number,
) {
  const limits: number[] = []
  if (Number.isSafeInteger(counter.declaredInput) && counter.declaredInput! > 0)
    limits.push(counter.declaredInput!)
  if (
    Number.isSafeInteger(counter.declaredContext) &&
    counter.declaredContext! > 0
  )
    limits.push(Math.max(0, counter.declaredContext! - outputTokens))
  return limits.length ? Math.min(...limits) : undefined
}

/** Both long-input tests enforce a request count and a cumulative input budget. */
export function exceedsContextBudget(options: {
  requests: number
  inputTokens: number
  nextInputTokens: number
  maxRequests: number
  maxInputTokens: number
}) {
  return (
    options.requests >= options.maxRequests ||
    options.inputTokens + options.nextInputTokens > options.maxInputTokens
  )
}
