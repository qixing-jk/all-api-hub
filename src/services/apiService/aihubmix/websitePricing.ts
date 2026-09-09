import { z } from "zod"

import { AIHUBMIX_API_ORIGIN } from "~/constants/siteType"
import { buildAIHubMixMeteredImagePlan } from "~/services/apiService/aihubmix/meteredImagePricing"
import {
  buildAIHubMixMeteredVideoPlan,
  buildAIHubMixSearchUnitPlan,
} from "~/services/apiService/aihubmix/meteredPricing"
import { buildAIHubMixPricingPlan } from "~/services/apiService/aihubmix/pricingPlan"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import {
  pricingPlanSchema,
  type PriceMeter,
  type PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { scalePricingRates } from "~/services/modelPricing/pricingRates"
import { isRecord } from "~/utils/core/object"

const nonnegative = z.number().finite().nonnegative()
const tokenBound = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1)
const outputTierSchema = z.strictObject({
  min_tokens: tokenBound,
  max_tokens: z.union([z.literal(-1), tokenBound]),
})
const tierSchema = z.strictObject({
  model_ratio: nonnegative,
  output_tier_condition: outputTierSchema.optional(),
  // The public renderer prices input as model_ratio * 2; this legacy field
  // does not multiply it (also corroborated by /model/qwen3-vl-plus).
  prompt_tokens_ratio: nonnegative.optional(),
  completion_tokens_ratio: nonnegative.optional(),
  cached_tokens_ratio: nonnegative.optional(),
  explicit_cached_tokens_ratio: nonnegative.optional(),
  implicit_cached_tokens_ratio: nonnegative.optional(),
  input_audio_tokens_ratio: nonnegative.optional(),
  cached_audio_tokens_ratio: nonnegative.optional(),
  output_audio_tokens_ratio: nonnegative.optional(),
  input_image_tokens_ratio: nonnegative.optional(),
  output_image_tokens_ratio: nonnegative.optional(),
  input_video_tokens_ratio: nonnegative.optional(),
  input_document_tokens_ratio: nonnegative.optional(),
  cache_write_tokens_ratio: nonnegative.optional(),
  cache_write_5_minutes_tokens_ratio: nonnegative.optional(),
  cache_write_1_hour_tokens_ratio: nonnegative.optional(),
  time_condition: z
    .strictObject({
      timezone: z.string(),
      ranges: z.array(z.string()).min(1).max(24),
    })
    .optional(),
  tier_condition: z
    .strictObject({
      min_tokens: tokenBound,
      max_tokens: z.union([z.literal(-1), tokenBound]),
    })
    .refine(
      (range) =>
        range.max_tokens === -1 || range.max_tokens >= range.min_tokens,
    ),
})
const billingSchema = z.strictObject({
  model_name: z.string(),
  default_tier: z.string(),
  enabled_billing_items: z.array(z.string()).optional(),
  token_based_tier_configs: z.record(z.string(), tierSchema),
  // Extra billing dimensions are not silently folded into token prices.
  per_unit_price_config: z.record(z.string(), z.unknown()).optional(),
})
const meterFields = {
  input_image_tokens: [PRICING_METERS.IMAGE_INPUT, "input_image_tokens_ratio"],
  output_image_tokens: [
    PRICING_METERS.IMAGE_OUTPUT,
    "output_image_tokens_ratio",
  ],
  input_audio_tokens: [PRICING_METERS.AUDIO_INPUT, "input_audio_tokens_ratio"],
  cached_audio_tokens: [
    PRICING_METERS.AUDIO_CACHE,
    "cached_audio_tokens_ratio",
  ],
  output_audio_tokens: [
    PRICING_METERS.AUDIO_OUTPUT,
    "output_audio_tokens_ratio",
  ],
  completion_tokens: [PRICING_METERS.OUTPUT, "completion_tokens_ratio"],
  cached_tokens: [PRICING_METERS.CACHE_READ, "cached_tokens_ratio"],
  cache_write_tokens: [PRICING_METERS.CACHE_WRITE, "cache_write_tokens_ratio"],
  cache_write_5_minutes_tokens: [
    PRICING_METERS.CACHE_WRITE,
    "cache_write_5_minutes_tokens_ratio",
  ],
  cache_write_1_hour_tokens: [
    PRICING_METERS.CACHE_WRITE1H,
    "cache_write_1_hour_tokens_ratio",
  ],
} as const
// These independent billing dimensions do not change the selected text-token
// rates. Their settlement quantities/units are not yet modeled here.
const additionalItems = new Set([
  "image_generation",
  "web_search_requests",
  "cache_storage_hours",
  "input_video_tokens",
  "input_document_tokens",
])
const additionalPrices = new Set(["web_search_price", "cache_storage_price"])

/** Human-readable model pricing page, independent of an imported console URL. */
export function getAIHubMixPricingSource(
  modelId: string,
): PricingPlan["source"] {
  return {
    kind: PRICING_SOURCE_KINDS.CATALOG,
    label: "Aihubmix",
    url: `${AIHUBMIX_API_ORIGIN}/model/${encodeURIComponent(modelId)}#pricing`,
  }
}

/**
 * Website /call/mdl_info and /static/index-Cx6RE_vc.js (io), verified 2026-09-09:
 * tier model_ratio * 2 is USD/M input; output/cache ratios multiply that value.
 * Ranges include both endpoints, and -1 has no upper bound. The website labels
 * the axis Input but does not establish whether it includes cached tokens.
 */
export function buildAIHubMixWebsitePricingPlan(
  modelId: string,
  billingConfig: unknown,
  promotion?: unknown,
): PricingPlan {
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: getAIHubMixPricingSource(modelId),
    issues: [
      {
        code: PRICING_ISSUE_CODES.UNKNOWN_FEES,
        meters: [PRICING_METERS.REQUEST],
      },
    ],
    requiresRuleMatch: true,
  }
  const unsupported = (): PricingPlan => ({
    ...plan,
    usageMode: PRICING_USAGE_MODES.CUSTOM,
    rates: {},
    rules: [],
    source: { ...plan.source, rulesUnavailable: true },
    requiresRuleMatch: false,
    issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
  })
  let raw: unknown
  try {
    raw =
      typeof billingConfig === "string"
        ? JSON.parse(billingConfig)
        : billingConfig
  } catch {
    return unsupported()
  }
  const imagePlan = buildAIHubMixMeteredImagePlan(raw, plan.source)
  if (imagePlan) return promotion == null ? imagePlan : unsupported()
  const meteredPlan =
    buildAIHubMixMeteredVideoPlan(raw, plan.source) ??
    buildAIHubMixSearchUnitPlan(raw, plan.source)
  if (meteredPlan) return promotion == null ? meteredPlan : unsupported()
  // /call/mdl_info supplies metered video rules separately from legacy ratios.
  // Their settlement semantics and the site's prose may disagree; preserve the
  // billing dimension, but do not reinterpret a reservation as a final price.
  if (
    isRecord(raw) &&
    isRecord(raw.metered_price_config) &&
    isRecord(raw.metered_price_config.video_generation)
  ) {
    return {
      ...unsupported(),
      usageMode:
        raw.metered_price_config.video_generation.unit === "token"
          ? PRICING_USAGE_MODES.VIDEO
          : PRICING_USAGE_MODES.CUSTOM,
    }
  }
  const parsed = billingSchema.safeParse(raw)
  if (!parsed.success) return unsupported()
  const config = parsed.data
  if (
    Object.values(config.token_based_tier_configs).some((tier) =>
      [
        tier.explicit_cached_tokens_ratio,
        tier.implicit_cached_tokens_ratio,
      ].some(
        (ratio) => ratio !== undefined && ratio !== tier.cached_tokens_ratio,
      ),
    )
  )
    plan.issues.push({
      code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
      meters: [PRICING_METERS.CACHE_READ],
      reason: PRICING_ISSUE_REASONS.REQUEST_CONDITION,
    })
  const tiers = Object.entries(config.token_based_tier_configs).sort(
    ([, a], [, b]) =>
      Number(!!a.time_condition) - Number(!!b.time_condition) ||
      a.tier_condition.min_tokens - b.tier_condition.min_tokens,
  )
  // /static/index-Cx6RE_vc.js ra/ia: an unconditional baseline and one timed
  // override use the named timezone; the baseline applies outside those windows.
  const timed = tiers.filter(([, tier]) => tier.time_condition)
  if (
    timed.length &&
    (tiers.length !== 2 ||
      timed.length !== 1 ||
      tiers.some(
        ([, tier]) =>
          tier.tier_condition.min_tokens !== 0 ||
          tier.tier_condition.max_tokens !== -1,
      ) ||
      config.token_based_tier_configs[config.default_tier]?.time_condition)
  )
    return unsupported()
  if (!tiers.length || !config.token_based_tier_configs[config.default_tier])
    return unsupported()
  if (
    config.enabled_billing_items?.some(
      (item) =>
        item !== "prompt_tokens" &&
        !Object.hasOwn(meterFields, item) &&
        !additionalItems.has(item),
    )
  )
    return unsupported()
  const extraPrices = Object.entries(config.per_unit_price_config ?? {})
  if (
    extraPrices.some(
      ([key, value]) =>
        !additionalPrices.has(key) || !nonnegative.safeParse(value).success,
    )
  )
    return unsupported()
  if (
    extraPrices.length ||
    config.enabled_billing_items?.some((item) => additionalItems.has(item)) ||
    tiers.some(
      ([, tier]) =>
        tier.input_video_tokens_ratio !== undefined ||
        tier.input_document_tokens_ratio !== undefined,
    )
  )
    plan.source.hasUnpricedCharges = true
  // A unit input price makes the existing promotion compiler return its factor,
  // including when a real tier has zero-priced meters or additional cache meters.
  const promotional =
    promotion == null
      ? undefined
      : buildAIHubMixPricingPlan({ input: 1 }, promotion)
  if (
    promotional?.issues.some(
      (issue) => issue.code === PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
    )
  )
    return unsupported()
  const promotionRules: PricingPlan["rules"] = []
  for (const [index, [id, tier]] of tiers.entries()) {
    const range = tier.tier_condition
    // The site's formatter uses inclusive input ranges, but output splits are
    // <= max when min=0, and strictly > min otherwise (index-Cx6RE_vc.js).
    const outputRange = (candidate: typeof tier) => {
      const output = candidate.output_tier_condition
      return {
        min: output && output.min_tokens > 0 ? output.min_tokens + 1 : 0,
        max:
          !output || output.min_tokens > 0 || output.max_tokens === -1
            ? Infinity
            : output.max_tokens,
      }
    }
    const output = outputRange(tier)
    if (
      tiers.slice(0, index).some(([, previous]) => {
        if (tier.time_condition || previous.time_condition) return false
        const prior = previous.tier_condition
        const priorOutput = outputRange(previous)
        return (
          range.min_tokens <=
            (prior.max_tokens === -1 ? Infinity : prior.max_tokens) &&
          prior.min_tokens <=
            (range.max_tokens === -1 ? Infinity : range.max_tokens) &&
          output.min <= priorOutput.max &&
          priorOutput.min <= output.max
        )
      })
    )
      return unsupported()
    const rates: PricingPlan["rates"] = {}
    const addRate = (meter: PriceMeter, ratio: number) => {
      rates[meter] = {
        amount: tier.model_ratio * 2 * ratio,
        currency: "USD",
        unit: PRICE_RATE_UNITS.TOKEN,
        per: TOKENS_PER_MILLION,
      }
    }
    if (
      !config.enabled_billing_items ||
      config.enabled_billing_items.includes("prompt_tokens")
    )
      addRate(PRICING_METERS.INPUT, 1)
    for (const [item, [meter, field]] of Object.entries(meterFields)) {
      const ratio = tier[field]
      if (
        ratio !== undefined &&
        (!config.enabled_billing_items ||
          config.enabled_billing_items.includes(item))
      ) {
        // Both legacy and explicit five-minute cache-write aliases can appear
        // in /call/mdl_info. Coalesce equal prices, reject conflicting aliases.
        if (
          rates[meter] &&
          rates[meter]!.amount !== tier.model_ratio * 2 * ratio
        )
          return unsupported()
        addRate(meter, ratio)
      }
    }
    const conditions: PricingPlan["rules"][number]["conditions"] =
      range.min_tokens === 0 && range.max_tokens === -1
        ? []
        : [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS_CACHE_BASIS_UNKNOWN,
              min: range.min_tokens,
              ...(range.max_tokens === -1
                ? {}
                : { maxExclusive: range.max_tokens + 1 }),
            },
          ]
    if (
      tier.output_tier_condition &&
      (output.min > 0 || Number.isFinite(output.max))
    )
      conditions.push({
        kind: PRICING_CONDITION_KINDS.RANGE,
        axis: PRICING_RANGE_AXES.OUTPUT_TOKENS,
        min: output.min,
        ...(Number.isFinite(output.max)
          ? { maxExclusive: output.max + 1 }
          : {}),
      })
    const timeWindows: PricingPlan["rules"][number]["conditions"][] = []
    if (tier.time_condition) {
      for (const text of tier.time_condition.ranges) {
        const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(text)
        if (
          !match ||
          Number(match[1]) > 23 ||
          Number(match[3]) > 23 ||
          Number(match[2]) > 59 ||
          Number(match[4]) > 59
        )
          return unsupported()
        const startMinute = Number(match[1]) * 60 + Number(match[2])
        const endMinute = Number(match[3]) * 60 + Number(match[4])
        if (startMinute >= endMinute) return unsupported()
        timeWindows.push([
          {
            kind: PRICING_CONDITION_KINDS.TIME_WINDOW,
            timeZone: tier.time_condition.timezone,
            startMinute,
            endMinute,
          },
        ])
      }
    } else timeWindows.push([])
    for (const [windowIndex, window] of timeWindows.entries()) {
      const ruleConditions = [...conditions, ...window]
      plan.rules.push({
        id: tier.time_condition ? `${id}-${windowIndex}` : id,
        conditions: ruleConditions,
        rates,
      })
      // Reuse the provider's verified promotion timing, applied to each tier's rates.
      if (promotional) {
        for (const rule of promotional.rules) {
          // All website-supported token meters are promotable by the same percentage.
          const factor = rule.rates.input!.amount
          if (!Number.isFinite(factor)) return unsupported()
          promotionRules.push({
            id: `${id}-${windowIndex}-${rule.id}`,
            conditions: [...ruleConditions, ...rule.conditions],
            rates: scalePricingRates(rates, factor),
          })
        }
      }
    }
  }
  plan.rules.push(...promotionRules)
  return pricingPlanSchema.safeParse(plan).success ? plan : unsupported()
}
