import type { LanguageModelUsage, StepResultPerformance } from "ai"

import { isRecord } from "~/utils/core/object"

const metricKeys = [
  "responseTimeMs",
  "timeToFirstOutputMs",
  "outputTokensPerSecond",
  "effectiveOutputTokensPerSecond",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cachedInputTokens",
] as const
const MAX_GENERATION_METRIC_STEPS = 32

/** SDK measurements for one model step; the runtime allow-list owns the fields. */
export type VerificationGenerationMetrics = Partial<
  Record<(typeof metricKeys)[number], number>
>

/** Allow-list finite SDK facts at runtime and persisted-history boundaries. */
export function sanitizeGenerationMetrics(
  value: unknown,
): VerificationGenerationMetrics[] | undefined {
  if (!Array.isArray(value)) return undefined
  const metrics = value
    .slice(0, MAX_GENERATION_METRIC_STEPS)
    .filter(isRecord)
    .map((item) => {
      const result: VerificationGenerationMetrics = {}
      for (const key of metricKeys) {
        const number = item[key]
        if (
          typeof number === "number" &&
          Number.isFinite(number) &&
          number >= 0
        )
          result[key] = number
      }
      if (result.outputTokens === undefined) {
        delete result.outputTokensPerSecond
        delete result.effectiveOutputTokensPerSecond
      }
      return result
    })
    .filter((item) => Object.keys(item).length > 0)
  return metrics.length ? metrics : undefined
}

/** Project SDK step results without recomputing their timing or throughput. */
export function getGenerationMetrics(
  steps:
    | readonly {
        performance?: StepResultPerformance
        usage?: LanguageModelUsage
      }[]
    | undefined,
) {
  return sanitizeGenerationMetrics(
    steps?.map(({ performance, usage }) => ({
      responseTimeMs: performance?.responseTimeMs,
      timeToFirstOutputMs: performance?.timeToFirstOutputMs,
      outputTokensPerSecond: performance?.outputTokensPerSecond,
      effectiveOutputTokensPerSecond:
        performance?.effectiveOutputTokensPerSecond,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      reasoningTokens: usage?.outputTokenDetails?.reasoningTokens,
      cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens,
    })),
  )
}
