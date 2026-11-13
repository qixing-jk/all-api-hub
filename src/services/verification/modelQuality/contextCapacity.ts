import type { VerificationGenerationMetrics } from "~/services/verification/aiApiVerification/generationMetrics"
import type { VerificationGenerationProgress } from "~/services/verification/aiApiVerification/generationProgress"
import {
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
  type CONTEXT_ATTEMPT_FAILURE_REASONS,
  type ContextCapacityReason,
} from "~/services/verification/modelQuality/contextCapacityConstants"

import { CONTEXT_CAPACITY_DEFAULTS as defaults } from "./contextCapacityDefaults"
import { exceedsContextBudget } from "./contextLimits"

export type ContextAttemptOutcome =
  (typeof CONTEXT_ATTEMPT_OUTCOMES)[keyof typeof CONTEXT_ATTEMPT_OUTCOMES]

export type ContextAttempt = {
  metrics?: VerificationGenerationMetrics[]
  outcome: ContextAttemptOutcome
  inputTokens?: number
  outputTokens?: number
  localInputTokens?: number
  finishReason?: string
  message?: string
  failureReason?: (typeof CONTEXT_ATTEMPT_FAILURE_REASONS)[keyof typeof CONTEXT_ATTEMPT_FAILURE_REASONS]
}

export type ContextCapacityResult = {
  generation?: VerificationGenerationProgress
  generationStartedAt?: number
  lowerBoundTokens: number
  upperBoundTokens?: number
  reason: Exclude<ContextCapacityReason, typeof CONTEXT_CAPACITY_REASONS.Error>
  attempts: (ContextAttempt & { targetTokens: number })[]
}

/** Search only across confirmed input acceptance and explicit capacity rejection. */
export async function probeContextCapacity(options: {
  maxInputTokens: number
  initialInputTokens?: number
  resolutionTokens?: number
  maxRequests?: number
  maxTotalInputTokens?: number
  resumeFrom?: ContextCapacityResult
  signal?: AbortSignal
  onProgress?: (result: ContextCapacityResult) => void | Promise<void>
  beforeAttempt?: (
    target: number,
    result: ContextCapacityResult,
  ) => Promise<void>
  attempt: (tokens: number) => Promise<ContextAttempt>
}): Promise<ContextCapacityResult> {
  for (const value of [
    options.maxInputTokens,
    options.initialInputTokens ?? options.maxInputTokens,
    options.resolutionTokens ?? defaults.resolutionTokens,
    options.maxRequests ?? defaults.maxRequests,
    options.maxTotalInputTokens ?? defaults.maxTotalInputTokens,
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error("Capacity limits must be positive integers")
  }
  const result: ContextCapacityResult = {
    lowerBoundTokens: 0,
    reason: CONTEXT_CAPACITY_REASONS.TestLimit,
    attempts: [],
  }
  const resolution = options.resolutionTokens ?? defaults.resolutionTokens
  let total = 0
  let acceptedTarget = 0
  let rejectedTarget: number | undefined
  const minimum = Math.min(defaults.minimumInputTokens, options.maxInputTokens)
  let next = Math.min(
    options.maxInputTokens,
    Math.max(minimum, options.initialInputTokens ?? options.maxInputTokens),
  )
  if (options.resumeFrom !== undefined) {
    const previous = options.resumeFrom
    if (
      !previous ||
      previous.reason !== CONTEXT_CAPACITY_REASONS.Budget ||
      !Array.isArray(previous.attempts) ||
      previous.attempts.length > defaults.maxContinuationAttempts
    )
      throw new Error("Invalid capacity continuation")
    for (const attempt of previous.attempts) {
      if (
        !attempt ||
        !Number.isSafeInteger(attempt.targetTokens) ||
        attempt.targetTokens < minimum ||
        attempt.targetTokens > options.maxInputTokens ||
        ![
          CONTEXT_ATTEMPT_OUTCOMES.Accepted,
          CONTEXT_ATTEMPT_OUTCOMES.ContextLimit,
        ].some((outcome) => outcome === attempt.outcome) ||
        (attempt.localInputTokens !== undefined &&
          (!Number.isSafeInteger(attempt.localInputTokens) ||
            attempt.localInputTokens < 0))
      )
        throw new Error("Invalid capacity continuation")
      result.attempts.push({ ...attempt })
      if (attempt.outcome === CONTEXT_ATTEMPT_OUTCOMES.Accepted) {
        acceptedTarget = attempt.targetTokens
        result.lowerBoundTokens = attempt.localInputTokens ?? acceptedTarget
      } else {
        rejectedTarget = attempt.targetTokens
        result.upperBoundTokens = attempt.localInputTokens ?? rejectedTarget
      }
    }
    if (rejectedTarget !== undefined && acceptedTarget >= rejectedTarget)
      throw new Error("Invalid capacity continuation")
    if (rejectedTarget !== undefined) {
      next =
        acceptedTarget > 0
          ? Math.floor((acceptedTarget + rejectedTarget) / 2)
          : Math.max(minimum, Math.floor(rejectedTarget / 2))
      if (acceptedTarget > 0 && rejectedTarget - acceptedTarget <= resolution)
        result.reason = CONTEXT_CAPACITY_REASONS.Bracketed
    } else if (acceptedTarget > 0)
      next = Math.min(acceptedTarget * 2, options.maxInputTokens)
  }
  const previousCount = result.attempts.length
  const exceedsBudget = (targetTokens: number) =>
    exceedsContextBudget({
      requests: result.attempts.length - previousCount,
      inputTokens: total,
      nextInputTokens: targetTokens,
      maxRequests: options.maxRequests ?? defaults.maxRequests,
      maxInputTokens:
        options.maxTotalInputTokens ?? defaults.maxTotalInputTokens,
    })
  while (result.reason !== CONTEXT_CAPACITY_REASONS.Bracketed) {
    if (options.signal?.aborted) {
      result.reason = CONTEXT_CAPACITY_REASONS.Stopped
      break
    }
    if (exceedsBudget(next)) {
      result.reason = CONTEXT_CAPACITY_REASONS.Budget
      break
    }
    await options.beforeAttempt?.(next, result)
    options.signal?.throwIfAborted()
    const attempt = await options.attempt(next)
    if (options.signal?.aborted) {
      result.reason = CONTEXT_CAPACITY_REASONS.Stopped
      break
    }
    total += Math.max(next, attempt.inputTokens ?? 0)
    result.attempts.push({ ...attempt, targetTokens: next })
    if (attempt.outcome === CONTEXT_ATTEMPT_OUTCOMES.Accepted) {
      result.lowerBoundTokens = attempt.localInputTokens ?? next
      acceptedTarget = next
    } else if (attempt.outcome === CONTEXT_ATTEMPT_OUTCOMES.ContextLimit) {
      result.upperBoundTokens = attempt.localInputTokens ?? next
      rejectedTarget = next
    } else {
      result.reason = CONTEXT_CAPACITY_REASONS.Inconclusive
      await options.onProgress?.({ ...result, attempts: [...result.attempts] })
      break
    }
    await options.onProgress?.({ ...result, attempts: [...result.attempts] })
    if (rejectedTarget !== undefined) {
      if (acceptedTarget === 0) {
        if (next === minimum) {
          result.reason = CONTEXT_CAPACITY_REASONS.Inconclusive
          break
        }
        next = Math.max(minimum, Math.floor(next / 2))
        continue
      }
      if (rejectedTarget - acceptedTarget <= resolution) {
        result.reason = CONTEXT_CAPACITY_REASONS.Bracketed
        break
      }
      next = Math.floor((acceptedTarget + rejectedTarget) / 2)
    } else {
      if (next === options.maxInputTokens) break
      next = Math.min(next * 2, options.maxInputTokens)
    }
  }
  if (
    result.reason === CONTEXT_CAPACITY_REASONS.Bracketed &&
    acceptedTarget > 0
  ) {
    if (exceedsBudget(acceptedTarget))
      result.reason = CONTEXT_CAPACITY_REASONS.Budget
    else if (options.signal?.aborted)
      result.reason = CONTEXT_CAPACITY_REASONS.Stopped
    else {
      await options.beforeAttempt?.(acceptedTarget, result)
      options.signal?.throwIfAborted()
      const confirmation = await options.attempt(acceptedTarget)
      if (options.signal?.aborted)
        result.reason = CONTEXT_CAPACITY_REASONS.Stopped
      else {
        result.attempts.push({ ...confirmation, targetTokens: acceptedTarget })
        if (confirmation.outcome !== CONTEXT_ATTEMPT_OUTCOMES.Accepted)
          result.reason = CONTEXT_CAPACITY_REASONS.Inconclusive
      }
    }
  }
  await options.onProgress?.({ ...result, attempts: [...result.attempts] })
  return result
}
