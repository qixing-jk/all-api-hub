import { normalizeNewApiModelPricingResponse } from "~/services/apiAdapters/newApi/modelPricingDto"
import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelTokenPriceTier,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import { isRecord } from "~/utils/core/object"

const isRatio = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

/** Prefer exact configuration, then the most specific trailing-wildcard rule. */
function findContextPricing(
  conditions: Record<string, unknown>,
  modelName: string,
): unknown {
  const candidates = [modelName, modelName.toLowerCase()]
  for (const candidate of candidates) {
    if (Object.hasOwn(conditions, candidate)) return conditions[candidate]
  }
  // APIyi's current structured rules use trailing stars for model variants,
  // including gemini-3.1-pro-preview-*. Match strings without compiling regex.
  return Object.entries(conditions)
    .filter(([pattern]) => {
      if (!pattern.endsWith("*")) return false
      const prefix = pattern.slice(0, -1)
      return (
        !prefix.includes("*") &&
        candidates.some((candidate) => candidate.startsWith(prefix))
      )
    })
    .sort(
      ([left], [right]) =>
        right.length - left.length || (left < right ? -1 : 1),
    )[0]?.[1]
}

/** Decode complete context tiers without evaluating the server's expression. */
function normalizeContextTiers(
  value: unknown,
  cnyPerUsd: number,
): ModelTokenPriceTier[] | undefined {
  if (
    !isRecord(value) ||
    (value.Currency !== undefined &&
      value.Currency !== "USD" &&
      value.Currency !== "CNY") ||
    !Array.isArray(value.Conditions) ||
    value.Conditions.length === 0
  ) {
    return undefined
  }

  const tiers: ModelTokenPriceTier[] = []
  for (const condition of value.Conditions) {
    if (
      !isRecord(condition) ||
      !Number.isSafeInteger(condition.MinTokens) ||
      (condition.MinTokens as number) < 0 ||
      !Number.isSafeInteger(condition.MaxTokens) ||
      (condition.MaxTokens !== -1 &&
        (condition.MaxTokens as number) < (condition.MinTokens as number)) ||
      !isRatio(condition.InputRatio) ||
      !isRatio(condition.CompletionRatio) ||
      (condition.FixedPrice !== undefined && condition.FixedPrice !== 0) ||
      (condition.TimeRanges !== undefined &&
        (!Array.isArray(condition.TimeRanges) ||
          condition.TimeRanges.length > 0))
    ) {
      return undefined
    }

    tiers.push({
      min_context_tokens: condition.MinTokens as number,
      ...(condition.MaxTokens === -1
        ? {}
        : { max_context_tokens: condition.MaxTokens as number }),
      model_ratio:
        value.Currency === "CNY"
          ? condition.InputRatio / cnyPerUsd
          : condition.InputRatio,
      completion_ratio: condition.CompletionRatio,
    })
  }
  tiers.sort(
    (left, right) => left.min_context_tokens - right.min_context_tokens,
  )
  if (tiers[0].min_context_tokens !== 0) return undefined
  for (let index = 1; index < tiers.length; index += 1) {
    const previousMax = tiers[index - 1].max_context_tokens
    if (
      previousMax === undefined ||
      tiers[index].min_context_tokens <= previousMax
    ) {
      return undefined
    }
  }
  return tiers
}

/** Retain family model/group behavior and enrich APIyi's structured token tiers. */
export function normalizeApiYiModelPricingResponse(
  value: unknown,
  status?: unknown,
): PricingResponse {
  const response = normalizeNewApiModelPricingResponse(value)
  if (!isRecord(value)) return response

  // https://api.apiyi.com/account/pricing (v29.8.9) reads these inclusive
  // MinTokens/MaxTokens tiers, with -1 meaning unbounded and cache ratios
  // relative to each tier's input price. `billing_expr` is never executed.
  const conditions = isRecord(value.ModelConditionalPricing)
    ? value.ModelConditionalPricing
    : {}
  // The same page converts CNY tier ratios with usd_exchange_rate, then price,
  // and defaults to 7.3 when neither site setting supplies a positive rate.
  const siteStatus = isRecord(status) ? status : {}
  const usdExchangeRate = Number(
    siteStatus.usd_exchange_rate || siteStatus.price,
  )
  const cnyPerUsd =
    Number.isFinite(usdExchangeRate) && usdExchangeRate > 0
      ? usdExchangeRate
      : 7.3
  return {
    ...response,
    data: response.data.map((model, index) => {
      const native = Array.isArray(value.data) ? value.data[index] : undefined
      if (
        !isRecord(native) ||
        native.billing_mode !== "tiered_expr" ||
        model.quota_type !== 0
      ) {
        return model
      }
      const tiers = normalizeContextTiers(
        findContextPricing(conditions, model.model_name),
        cnyPerUsd,
      )
      if (!tiers) {
        return {
          ...model,
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.CHANNEL_PRICING,
            precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            unavailable_reason:
              MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
          },
        }
      }

      return {
        ...model,
        model_ratio: tiers[0].model_ratio,
        completion_ratio: tiers[0].completion_ratio,
        token_price_tiers: tiers,
        token_price_ratios_to_input: {
          ...(isRatio(native.cache_ratio)
            ? { cache_read: native.cache_ratio }
            : {}),
          ...(isRatio(native.create_cache_ratio)
            ? { cache_write: native.create_cache_ratio }
            : {}),
        },
      }
    }),
  }
}
