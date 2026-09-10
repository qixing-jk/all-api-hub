import { normalizeNewApiModelPricingResponse } from "~/services/apiAdapters/newApi/modelPricingDto"
import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_SOURCE_KINDS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import { isRecord } from "~/utils/core/object"

interface ModelTokenPriceTier {
  min_context_tokens: number
  max_context_tokens?: number
  model_ratio: number
  completion_ratio: number
}

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
      condition.MaxTokens === Number.MAX_SAFE_INTEGER ||
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
      const nativePlan = findContextPricing(conditions, model.model_name)
      const tiers = normalizeContextTiers(nativePlan, cnyPerUsd)
      if (!tiers) {
        return {
          ...model,
          pricingPlan: {
            rates: {},
            rules: [],
            source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
            groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
            issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
          },
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
        pricingPlan: {
          rates: {
            request: {
              amount: 0,
              currency: "USD",
              unit: PRICE_RATE_UNITS.REQUEST,
              per: 1,
            },
          },
          groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
          source: {
            kind: PRICING_SOURCE_KINDS.ACCOUNT,
            capturedAt: new Date().toISOString(),
            url: "https://api.apiyi.com/account/pricing",
            ...(isRecord(nativePlan) && nativePlan.Currency === "CNY"
              ? { conversion: { originalCurrency: "CNY" as const, cnyPerUsd } }
              : {}),
          },
          requiresRuleMatch: true,
          issues: [
            {
              code: PRICING_ISSUE_CODES.UNVERIFIED_AXIS,
              meters: [
                PRICING_METERS.CACHE_READ,
                PRICING_METERS.CACHE_WRITE,
                PRICING_METERS.CACHE_WRITE1H,
              ],
            },
          ],
          rules: tiers.map((tier, index) => {
            const input = tier.model_ratio * 2
            const rate = (amount: number) => ({
              amount,
              currency: "USD" as const,
              unit: PRICE_RATE_UNITS.TOKEN,
              per: TOKENS_PER_MILLION,
            })
            return {
              id: `context-${index}`,
              // APIyi /pricing v29.8.9 shows input ranges but not cache inclusion.
              // Both candidate input bases coincide for explicitly uncached requests.
              conditions: [
                {
                  kind: PRICING_CONDITION_KINDS.RANGE,
                  axis: PRICING_RANGE_AXES.INPUT_TOKENS_CACHE_BASIS_UNKNOWN,
                  min: tier.min_context_tokens,
                  ...(tier.max_context_tokens === undefined
                    ? {}
                    : { maxExclusive: tier.max_context_tokens + 1 }),
                },
              ],
              rates: {
                input: rate(input),
                output: rate(input * tier.completion_ratio),
                ...(isRatio(native.cache_ratio)
                  ? { cacheRead: rate(input * native.cache_ratio) }
                  : {}),
                ...(isRatio(native.create_cache_ratio)
                  ? { cacheWrite: rate(input * native.create_cache_ratio) }
                  : {}),
              },
            }
          }),
        },
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
