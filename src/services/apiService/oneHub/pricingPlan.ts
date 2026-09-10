import type { OneHubModelPricingItem } from "~/services/apiService/oneHub/type"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_RESPONSE_FORMATS,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import {
  pricingPlanSchema,
  type PriceRate,
  type PricingPlan,
} from "~/services/modelPricing/pricingPlan"

const LONG_CONTEXT_RULE_ID = "long-context"

/**
 * DoneHub ratios: $0.002/1K tokens; long context scales all input-side usage.
 * https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/model/price.go
 * relay/relay_util/quota.go selects the tier before cache normalization.
 */
export function buildDoneHubPricingPlan(
  price: OneHubModelPricingItem["price"],
): PricingPlan {
  const rate = (amount: number): PriceRate => ({
    amount,
    per: TOKENS_PER_MILLION,
    currency: "USD",
    unit: PRICE_RATE_UNITS.TOKEN,
  })
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
    issues: [],
  }
  if (price.type === "times") {
    plan.rates.request = {
      amount: price.input * 0.002,
      per: 1,
      currency: "USD",
      unit: PRICE_RATE_UNITS.REQUEST,
    }
  } else {
    const extra = price.extra_ratios ?? {}
    plan.rates = {
      input: rate(price.input * 2),
      output: rate(price.output * 2),
      cacheRead: rate(price.input * 2 * (extra.cached_read_tokens ?? 0.1)),
      cacheWrite: rate(price.input * 2 * (extra.cached_write_tokens ?? 1.25)),
      cacheWrite1h: rate(price.input * 2 * (extra.cached_write_1h_tokens ?? 2)),
      request: {
        amount: 0,
        per: 1,
        currency: "USD",
        unit: PRICE_RATE_UNITS.REQUEST,
      },
    }
    // types/common.go keeps OpenAI cached_tokens and Anthropic cached_read_tokens
    // separate; without a chosen response format they must agree to quote cache.
    const formatRates: PricingPlan["rates"] = {}
    if ((extra.cached_tokens ?? 1) !== (extra.cached_read_tokens ?? 0.1))
      formatRates.cacheRead = rate(price.input * 2 * (extra.cached_tokens ?? 1))
    // A distinct OpenAI cache-write override cannot share Anthropic's meter.
    if (
      (extra.openai_cache_write_tokens ?? 1.25) !==
      (extra.cached_write_tokens ?? 1.25)
    ) {
      formatRates.cacheWrite = rate(
        price.input * 2 * (extra.openai_cache_write_tokens ?? 1.25),
      )
    }
    for (const [key, value] of Object.entries(extra)) {
      if (
        [
          "cached_read_tokens",
          "cached_tokens",
          "cached_write_tokens",
          "cached_write_1h_tokens",
          "openai_cache_write_tokens",
        ].includes(key)
      )
        continue
      if (value !== 1)
        plan.issues.push({
          code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
          meters:
            key.includes("output") || key === "reasoning_tokens"
              ? [PRICING_METERS.OUTPUT]
              : [PRICING_METERS.INPUT],
        })
    }
    const tier = price.long_context
    const validTier =
      tier &&
      tier.threshold > 0 &&
      Number.isSafeInteger(tier.threshold) &&
      tier.threshold < Number.MAX_SAFE_INTEGER &&
      Number.isFinite(tier.input_ratio) &&
      Number.isFinite(tier.output_ratio)
    if (tier && tier.threshold > 0) {
      if (!validTier) {
        plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
      } else {
        const inputMultiplier = tier.input_ratio > 0 ? tier.input_ratio : 1
        const outputMultiplier = tier.output_ratio > 0 ? tier.output_ratio : 1
        const rates = Object.fromEntries(
          Object.entries(plan.rates)
            .filter(([meter]) => meter !== PRICING_METERS.REQUEST)
            .map(([meter, value]) => [
              meter,
              {
                ...value,
                amount:
                  value.amount *
                  (meter === PRICING_METERS.OUTPUT
                    ? outputMultiplier
                    : inputMultiplier),
              },
            ]),
        )
        plan.rules.push({
          id: LONG_CONTEXT_RULE_ID,
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS,
              min: tier.threshold + 1,
            },
          ],
          rates,
        })
      }
    } else if (tier && !Number.isFinite(tier.threshold)) {
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    }
    for (const format of [
      PRICING_RESPONSE_FORMATS.OPENAI,
      PRICING_RESPONSE_FORMATS.ANTHROPIC,
    ] as const) {
      const baseRates = Object.fromEntries(
        Object.keys(formatRates).map((meter) => [
          meter,
          format === PRICING_RESPONSE_FORMATS.OPENAI
            ? formatRates[meter as keyof typeof formatRates]
            : plan.rates[meter as keyof typeof formatRates],
        ]),
      )
      if (!Object.keys(baseRates).length) continue
      const conditions = [
        {
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.RESPONSE_FORMAT,
          value: format,
        },
      ]
      plan.rules.push({ id: `${format}-cache`, conditions, rates: baseRates })
      if (validTier) {
        plan.rules.push({
          id: `${format}-long-cache`,
          conditions: [
            ...conditions,
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS,
              min: tier.threshold + 1,
            },
          ],
          rates: Object.fromEntries(
            Object.entries(baseRates).map(([meter, value]) => [
              meter,
              {
                ...value!,
                amount:
                  value!.amount * (tier.input_ratio > 0 ? tier.input_ratio : 1),
              },
            ]),
          ),
        })
      }
    }
  }
  // Ambiguous cache prices belong to their response-format rules, not the base.
  if (price.type !== "times") {
    for (const rule of plan.rules.filter(
      (rule) => rule.id === `${PRICING_RESPONSE_FORMATS.OPENAI}-cache`,
    )) {
      for (const meter of Object.keys(
        rule.rates,
      ) as (keyof PricingPlan["rates"])[]) {
        delete plan.rates[meter]
        for (const tier of plan.rules.filter(
          (item) => item.id === LONG_CONTEXT_RULE_ID,
        ))
          delete tier.rates[meter]
      }
    }
  }
  return pricingPlanSchema.safeParse(plan).success
    ? plan
    : {
        ...plan,
        rates: {},
        rules: [],
        issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
      }
}
