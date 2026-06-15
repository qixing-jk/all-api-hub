export type ModelPriceTableEntry = {
  input?: number | string | null
  output?: number | string | null
  cache_read?: number | string | null
  cache_write?: number | string | null
}

export type ModelPriceTable = {
  source: string
  source_date?: string
  models: Record<string, ModelPriceTableEntry>
}

type LiteLlmPriceTableEntry = {
  input_cost_per_token?: unknown
  output_cost_per_token?: unknown
  cache_read_input_token_cost?: unknown
  cache_creation_input_token_cost?: unknown
}

const LITELLM_MODEL_PRICE_TABLE_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

const USD_PER_TOKEN_TO_USD_PER_MILLION = 1_000_000

const toFiniteNonNegativeNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
  }

  return undefined
}

const toUsdPerMillion = (value: unknown): number | undefined => {
  const pricePerToken = toFiniteNonNegativeNumber(value)
  return typeof pricePerToken === "number"
    ? pricePerToken * USD_PER_TOKEN_TO_USD_PER_MILLION
    : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const normalizeLiteLlmPriceTable = (payload: unknown): ModelPriceTable => {
  if (!isRecord(payload)) {
    throw new Error("Invalid LiteLLM price table payload")
  }

  const models = Object.fromEntries(
    Object.entries(payload).flatMap(([modelId, value]) => {
      if (modelId === "sample_spec" || !isRecord(value)) {
        return []
      }

      const entry = value as LiteLlmPriceTableEntry
      const normalized: ModelPriceTableEntry = {
        input: toUsdPerMillion(entry.input_cost_per_token),
        output: toUsdPerMillion(entry.output_cost_per_token),
        cache_read: toUsdPerMillion(entry.cache_read_input_token_cost),
        cache_write: toUsdPerMillion(entry.cache_creation_input_token_cost),
      }
      const cleaned = Object.fromEntries(
        Object.entries(normalized).filter(
          ([, price]) => typeof price === "number",
        ),
      ) as ModelPriceTableEntry

      return Object.keys(cleaned).length > 0 ? [[modelId, cleaned]] : []
    }),
  )

  return {
    source: LITELLM_MODEL_PRICE_TABLE_URL,
    models,
  }
}

/**
 * Loads the official-price snapshot used by optional catalog estimation.
 *
 * Source: LiteLLM model_prices_and_context_window.json. Values are USD per
 * token and are normalized to this app's USD-per-1M-token display units.
 */
export async function loadModelPriceTable(): Promise<ModelPriceTable> {
  const response = await fetch(LITELLM_MODEL_PRICE_TABLE_URL)
  if (!response.ok) {
    throw new Error("Failed to load LiteLLM price table")
  }

  return normalizeLiteLlmPriceTable(await response.json())
}
