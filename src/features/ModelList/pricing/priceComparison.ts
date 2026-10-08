export const MODEL_PRICE_COMPARISON_WEIGHT_KEYS = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
] as const

export type ModelPriceComparisonWeightKey =
  (typeof MODEL_PRICE_COMPARISON_WEIGHT_KEYS)[number]

export type ModelPriceComparisonWeights = Record<
  ModelPriceComparisonWeightKey,
  number | null
>

export const MODEL_PRICE_COMPARISON_PRESET_IDS = {
  AZURE_CONVERSATION: "azure-conversation",
  MOONCAKE_TOOL_AGENT: "mooncake-tool-agent",
  AZURE_CODE: "azure-code",
  TRACELAB_CODING_AGENT: "tracelab-coding-agent",
  CUSTOM: "custom",
} as const

export type ModelPriceComparisonPresetId =
  (typeof MODEL_PRICE_COMPARISON_PRESET_IDS)[keyof typeof MODEL_PRICE_COMPARISON_PRESET_IDS]

type BuiltInModelPriceComparisonPresetId = Exclude<
  ModelPriceComparisonPresetId,
  typeof MODEL_PRICE_COMPARISON_PRESET_IDS.CUSTOM
>

interface ModelPriceComparisonPreset {
  weights: ModelPriceComparisonWeights
  evidence: {
    source:
      | "azure-conversation"
      | "mooncake-tool-agent"
      | "azure-code"
      | "tracelab-inferred"
    unsupportedMeters: ModelPriceComparisonWeightKey[]
  }
}

/** Built-in workload shapes and their non-UI evidence coverage. */
export const MODEL_PRICE_COMPARISON_PRESETS: Record<
  BuiltInModelPriceComparisonPresetId,
  ModelPriceComparisonPreset
> = {
  [MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CONVERSATION]: {
    weights: { input: 84.54, output: 15.46, cacheRead: null, cacheWrite: null },
    evidence: {
      source: "azure-conversation",
      unsupportedMeters: ["cacheRead", "cacheWrite"],
    },
  },
  [MODEL_PRICE_COMPARISON_PRESET_IDS.MOONCAKE_TOOL_AGENT]: {
    weights: { input: 97.93, output: 2.07, cacheRead: null, cacheWrite: null },
    evidence: {
      source: "mooncake-tool-agent",
      unsupportedMeters: ["cacheRead", "cacheWrite"],
    },
  },
  [MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CODE]: {
    weights: { input: 98.66, output: 1.34, cacheRead: null, cacheWrite: null },
    evidence: {
      source: "azure-code",
      unsupportedMeters: ["cacheRead", "cacheWrite"],
    },
  },
  [MODEL_PRICE_COMPARISON_PRESET_IDS.TRACELAB_CODING_AGENT]: {
    weights: { input: 4.25, output: 0.34, cacheRead: 95.41, cacheWrite: null },
    evidence: {
      source: "tracelab-inferred",
      unsupportedMeters: ["cacheWrite"],
    },
  },
}

export const DEFAULT_MODEL_PRICE_COMPARISON_PRESET_ID =
  MODEL_PRICE_COMPARISON_PRESET_IDS.AZURE_CONVERSATION

export const DEFAULT_MODEL_PRICE_COMPARISON_WEIGHTS: ModelPriceComparisonWeights =
  MODEL_PRICE_COMPARISON_PRESETS[DEFAULT_MODEL_PRICE_COMPARISON_PRESET_ID]
    .weights

interface ComparableTokenPrices {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

/**
 * Calculates a weighted token cost. A positively weighted missing bucket is
 * unknown, not free, so the result is unavailable for price comparison.
 */
export function calculateWeightedTokenPrice(
  prices: ComparableTokenPrices,
  weights: ModelPriceComparisonWeights,
): number | null {
  let hasPositiveWeight = false
  let total = 0

  for (const key of MODEL_PRICE_COMPARISON_WEIGHT_KEYS) {
    const weight = weights[key]
    if (weight === null) {
      continue
    }
    if (!Number.isFinite(weight) || weight < 0) {
      return null
    }
    if (weight === 0) {
      continue
    }

    hasPositiveWeight = true
    const price = prices[key]
    if (price === undefined || !Number.isFinite(price) || price < 0) {
      return null
    }
    total += price * weight
  }

  return hasPositiveWeight && Number.isFinite(total) ? total : null
}
