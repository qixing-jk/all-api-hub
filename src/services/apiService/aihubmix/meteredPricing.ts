import { z } from "zod"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_METERS,
  PRICING_SELECTION_AXES,
  PRICING_USAGE_MODES,
  PRICING_VIDEO_INPUTS,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { normalizeVideoQuality } from "~/services/modelPricing/videoQuality"

const price = z.number().finite().nonnegative()

/** Decode optional serialized tables; malformed text cannot establish a price. */
function parsePriceTable(raw: unknown): unknown {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw
  } catch {
    return undefined
  }
}

/** Conflicting public representations cannot establish a comparable settlement price. */
function markAIHubMixPriceConflict(plan: PricingPlan): PricingPlan {
  return {
    ...plan,
    source: { ...plan.source, rulesUnavailable: true },
    issues: [
      {
        code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
        reason: PRICING_ISSUE_REASONS.SOURCE_CONFLICT,
      },
    ],
  }
}

/** Compare explicitly labeled prose rates with structured seconds, without model-name rules. */
export function checkAIHubMixVideoPriceEvidence(
  plan: PricingPlan,
  note: unknown,
): PricingPlan {
  if (
    plan.comparison?.meter !== PRICING_METERS.VIDEO_SECONDS ||
    typeof note !== "string"
  )
    return plan
  for (const match of note.matchAll(
    /(\d+(?:p|k))\s+video\s+\$(\d+(?:\.\d+)?)\s*\/s\b/gi,
  )) {
    const rule = plan.rules.find((rule) =>
      rule.conditions.some(
        (condition) =>
          condition.kind === PRICING_CONDITION_KINDS.SELECTION &&
          condition.axis === PRICING_SELECTION_AXES.VIDEO_QUALITY &&
          condition.value.toLowerCase() === match[1].toLowerCase(),
      ),
    )
    if (
      rule?.rates.videoSeconds &&
      rule.rates.videoSeconds.amount !== Number(match[2])
    )
      return markAIHubMixPriceConflict(plan)
  }
  return plan
}

/** Legacy table containers do not establish units; require a complete per-second rate list. */
export function buildAIHubMixLegacyVideoPlan(
  raw: unknown,
  note: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  if (typeof note !== "string") return undefined
  const value = parsePriceTable(raw)
  const parsed = z
    .strictObject({
      generate: z.strictObject({ standard: z.record(z.string(), price) }),
    })
    .safeParse(value)
  if (!parsed.success) return undefined
  if (!/per second|\/\s*S\b/i.test(note)) return undefined
  const entries: [string, number][] = []
  const scalar =
    /^\s*(?:\$\s*(\d+(?:\.\d+)?)\s*\/\s*S|The price of this model is \$(\d+(?:\.\d+)?) per second\.)\s*$/i.exec(
      note,
    )
  const table = parsed.data.generate.standard
  if (scalar) {
    const amount = Number(scalar[1] ?? scalar[2])
    const plan: PricingPlan = {
      usageMode: PRICING_USAGE_MODES.METERED,
      comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
      rates: {
        videoSeconds: {
          amount,
          currency: "USD",
          unit: PRICE_RATE_UNITS.SECOND,
          per: 1,
        },
      },
      rules: [],
      source,
      groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
      issues: [],
    }
    for (const [key, rate] of Object.entries(table)) {
      if (key === "standard") continue
      if (!/^(?:\d+[pk]|\d+x\d+)$/i.test(key)) return undefined
      const quality = normalizeVideoQuality(key)
      plan.rules.push({
        id: quality,
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
            value: quality,
          },
        ],
        rates: {
          videoSeconds: {
            amount: rate,
            currency: "USD",
            unit: PRICE_RATE_UNITS.SECOND,
            per: 1,
          },
        },
      })
    }
    plan.requiresRuleMatch = plan.rules.length > 0
    return table.standard === amount ? plan : markAIHubMixPriceConflict(plan)
  }
  const dimensions =
    /^The price for a (\d+)×(\d+) video is \$(\d+(?:\.\d+)?) per second, and for a (\d+)×(\d+) video is \$(\d+(?:\.\d+)?) per second\.$/i.exec(
      note.trim(),
    )
  if (dimensions) {
    entries.push(
      [`${dimensions[1]}x${dimensions[2]}`, Number(dimensions[3])],
      [`${dimensions[4]}x${dimensions[5]}`, Number(dimensions[6])],
    )
  }
  for (const segment of dimensions
    ? []
    : note
        .trim()
        .replace(/\.$/, "")
        .replaceAll("：", ":")
        .split(/[;；]\s*/)) {
    const match =
      /^(\d+(?:p|k)):\s*(?:price per second\s*)?\$?(\d+(?:\.\d+)?)(?:\s*per second|\s*\/\s*S)?$/i.exec(
        segment.trim(),
      )
    if (!match) return undefined
    entries.push([normalizeVideoQuality(match[1]), Number(match[2])])
  }
  if (
    !entries.length ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  )
    return undefined
  const plan: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.METERED,
    comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
    rates: {},
    requiresRuleMatch: true,
    rules: entries.map(([quality, amount]) => ({
      id: quality,
      conditions: [
        {
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
          value: quality,
        },
      ],
      rates: {
        videoSeconds: {
          amount,
          currency: "USD",
          unit: PRICE_RATE_UNITS.SECOND,
          per: 1,
        },
      },
    })),
    source,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
  const prices = new Set(entries.map(([, amount]) => amount))
  const conflict = Object.entries(table).some(([key, amount]) => {
    const quoted = entries.find(
      ([quality]) => quality.toLowerCase() === key.toLowerCase(),
    )
    return quoted ? quoted[1] !== amount : !prices.has(amount)
  })
  return conflict ? markAIHubMixPriceConflict(plan) : plan
}
const videoSchema = z.strictObject({
  model_name: z.string(),
  enabled_billing_items: z.array(z.enum(["video_generation", "image_input"])),
  metered_price_config: z.strictObject({
    video_generation: z.strictObject({
      unit: z.literal("second"),
      fallback_unit_price: price,
      price_rules: z
        .array(
          z.strictObject({
            match: z.strictObject({ quality: z.string().min(1) }),
            unit_price: price,
          }),
        )
        .max(128),
    }),
    image_input: z
      .strictObject({
        unit: z.literal("image"),
        fallback_unit_price: price,
        free_quantity: z.number().int().nonnegative().optional(),
      })
      .optional(),
  }),
})

/** Compile explicit seconds and reference-image allowances; reservations are not fees. */
export function buildAIHubMixMeteredVideoPlan(
  raw: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  const parsed = videoSchema.safeParse(raw)
  if (
    !parsed.success ||
    !parsed.data.enabled_billing_items.includes("video_generation")
  )
    return undefined
  const { video_generation: video, image_input: input } =
    parsed.data.metered_price_config
  const prices = new Map<string, number>()
  for (const rule of video.price_rules) {
    const quality = normalizeVideoQuality(rule.match.quality)
    const previous = prices.get(quality)
    if (previous !== undefined && previous !== rule.unit_price) return undefined
    prices.set(quality, rule.unit_price)
  }
  const inputEnabled = parsed.data.enabled_billing_items.includes("image_input")
  const missingInput = inputEnabled && !input
  return {
    usageMode: PRICING_USAGE_MODES.METERED,
    comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
    rates: {
      videoSeconds: {
        amount: video.fallback_unit_price,
        currency: "USD",
        unit: PRICE_RATE_UNITS.SECOND,
        per: 1,
      },
      ...(inputEnabled && input
        ? {
            referenceImage: {
              amount: input.fallback_unit_price,
              currency: "USD" as const,
              unit: PRICE_RATE_UNITS.IMAGE,
              per: 1,
              freeQuantity: input.free_quantity ?? 0,
            },
          }
        : {}),
    },
    requiresRuleMatch: prices.size > 0,
    rules: [...prices].map(([quality, amount]) => ({
      id: quality,
      conditions: [
        {
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
          value: quality,
        },
      ],
      rates: {
        videoSeconds: {
          amount,
          currency: "USD",
          unit: PRICE_RATE_UNITS.SECOND,
          per: 1,
        },
      },
    })),
    source: { ...source, hasUnpricedCharges: missingInput },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: missingInput
      ? [
          {
            code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
            meters: [PRICING_METERS.REFERENCE_IMAGE],
          },
        ]
      : [],
  }
}

/** Accept a complete, single-unit published character rate, never prose fragments. */
export function buildAIHubMixCharacterPlan(
  note: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  if (typeof note !== "string") return undefined
  const match =
    /^\s*\$([\d]+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(K|M)?\s*characters\s*$/i.exec(
      note,
    )
  if (!match) return undefined
  const amount = Number(match[1])
  const per =
    Number(match[2]) *
    (match[3]?.toUpperCase() === "K"
      ? 1000
      : match[3]?.toUpperCase() === "M"
        ? 1_000_000
        : 1)
  if (!Number.isFinite(amount) || !Number.isFinite(per) || per <= 0)
    return undefined
  return {
    usageMode: PRICING_USAGE_MODES.METERED,
    comparison: { meter: PRICING_METERS.CHARACTERS },
    rates: {
      characters: {
        amount,
        per,
        currency: "USD",
        unit: PRICE_RATE_UNITS.CHARACTER,
      },
    },
    rules: [],
    source,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
}

/** Search units are distinct from requests; only zero token tiers can be omitted. */
export function buildAIHubMixSearchUnitPlan(
  raw: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  const parsed = z
    .strictObject({
      model_name: z.string(),
      default_tier: z.string(),
      enabled_billing_items: z.array(
        z.enum(["prompt_tokens", "completion_tokens", "search_units"]),
      ),
      per_unit_price_config: z.strictObject({ search_units_price: price }),
      token_based_tier_configs: z.record(
        z.string(),
        z.strictObject({
          model_ratio: z.literal(0),
          prompt_tokens_ratio: z.literal(1),
          completion_tokens_ratio: z.literal(0),
          tier_condition: z.strictObject({
            min_tokens: z.literal(0),
            max_tokens: z.literal(-1),
          }),
        }),
      ),
    })
    .safeParse(raw)
  if (
    !parsed.success ||
    !parsed.data.enabled_billing_items.includes("search_units") ||
    !parsed.data.token_based_tier_configs[parsed.data.default_tier]
  )
    return undefined
  return {
    usageMode: PRICING_USAGE_MODES.METERED,
    comparison: { meter: PRICING_METERS.SEARCH_UNITS },
    rates: {
      searchUnits: {
        amount: parsed.data.per_unit_price_config.search_units_price,
        currency: "USD",
        unit: PRICE_RATE_UNITS.SEARCH_UNIT,
        per: 1,
      },
    },
    rules: [],
    source,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
}

/**
 * /call/mdl_info and /model/doubao-seedance-2-0-260128 publish two complete
 * per-second lists. The table alone has no unit, so corroborate every rate.
 */
export function buildAIHubMixReferenceVideoPlan(
  raw: unknown,
  note: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  if (typeof note !== "string") return undefined
  const value = parsePriceTable(raw)
  const tableSchema = z.strictObject({ standard: z.record(z.string(), price) })
  const parsed = z
    .strictObject({ generate: tableSchema, video_reference: tableSchema })
    .safeParse(value)
  const sections =
    /^\s*Input without video:\s*([^\n]+)\s*\nInput with video:\s*([^\n]+)\s*$/i.exec(
      note,
    )
  if (!parsed.success || !sections) return undefined
  const plan: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.METERED,
    comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
    rates: {},
    rules: [],
    requiresRuleMatch: true,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source,
    issues: [],
  }
  let conflict = false
  for (const [index, ability] of (
    ["generate", "video_reference"] as const
  ).entries()) {
    const entries = new Map<string, number>()
    for (const segment of sections[index + 1]
      .trim()
      .replace(/\.$/, "")
      .split(/;\s*/)) {
      const match =
        /^(\d+(?:p|k)):\s*\$(\d+(?:\.\d+)?)(?:\s*\/s|\s+per second)$/i.exec(
          segment.trim(),
        )
      if (!match) return undefined
      const quality = normalizeVideoQuality(match[1])
      if (entries.has(quality)) return undefined
      entries.set(quality, Number(match[2]))
    }
    if (!entries.size) return undefined
    const table = parsed.data[ability].standard
    const normalized = new Map<string, number>()
    for (const [key, amount] of Object.entries(table)) {
      const quality = normalizeVideoQuality(key)
      if (normalized.has(quality) && normalized.get(quality) !== amount)
        conflict = true
      normalized.set(quality, amount)
      if (quality === "standard") {
        if (![...entries.values()].includes(amount)) conflict = true
      } else if (entries.get(quality) !== amount) conflict = true
    }
    for (const [quality, amount] of entries) {
      if (normalized.get(quality) !== amount) conflict = true
      plan.rules.push({
        id: `${ability}-${quality}`,
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
            value: quality,
          },
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.VIDEO_INPUT,
            value:
              ability === "generate"
                ? PRICING_VIDEO_INPUTS.WITHOUT_VIDEO
                : PRICING_VIDEO_INPUTS.WITH_VIDEO,
          },
        ],
        rates: {
          videoSeconds: {
            amount,
            currency: "USD",
            unit: PRICE_RATE_UNITS.SECOND,
            per: 1,
          },
        },
      })
    }
  }
  return conflict ? markAIHubMixPriceConflict(plan) : plan
}

/** /model/glm-image corroborates the legacy table with a complete USD/image label. */
export function buildAIHubMixFixedImagePlan(
  raw: unknown,
  note: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  if (typeof note !== "string") return undefined
  const match = /^\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*IMG\s*$/i.exec(note)
  if (!match) return undefined
  // A whole, single-unit price statement is usable when no competing table exists.
  if (raw == null || raw === "")
    return {
      usageMode: PRICING_USAGE_MODES.IMAGE,
      rates: {
        image: {
          amount: Number(match[1]),
          currency: "USD",
          unit: PRICE_RATE_UNITS.IMAGE,
          per: 1,
        },
      },
      rules: [],
      source,
      groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
      issues: [],
    }
  const value = parsePriceTable(raw)
  const parsed = z
    .strictObject({
      generate: z.strictObject({
        standard: z.strictObject({ standard: price }),
      }),
    })
    .safeParse(value)
  if (!parsed.success) return undefined
  const plan: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.IMAGE,
    rates: {
      image: {
        amount: parsed.data.generate.standard.standard,
        currency: "USD",
        unit: PRICE_RATE_UNITS.IMAGE,
        per: 1,
      },
    },
    rules: [],
    source,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
  return Number(match[1]) === plan.rates.image!.amount
    ? plan
    : markAIHubMixPriceConflict(plan)
}

/** /call/mdl_info publishes full page/MP labels; tables must corroborate the unit. */
export function buildAIHubMixMeasuredOutputPlan(
  raw: unknown,
  note: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  if (typeof note !== "string") return undefined
  const match = /^\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*(page|MP)\s*$/i.exec(note)
  if (!match) return undefined
  const value = parsePriceTable(raw)
  const isPage = match[2].toLowerCase() === "page"
  const parsed = z
    .strictObject({
      generate: z.strictObject({
        standard: isPage
          ? z.strictObject({ standard: price })
          : z.strictObject({ per_megapixel: price }),
      }),
    })
    .safeParse(value)
  if (!parsed.success) return undefined
  const rates = parsed.data.generate.standard
  const amount = "standard" in rates ? rates.standard : rates.per_megapixel
  const meter = isPage ? PRICING_METERS.PAGES : PRICING_METERS.OUTPUT_MEGAPIXELS
  const plan: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.METERED,
    comparison: { meter },
    rates: {
      [meter]: {
        amount,
        currency: "USD",
        unit: isPage ? PRICE_RATE_UNITS.PAGE : PRICE_RATE_UNITS.MEGAPIXEL,
        per: 1,
      },
    },
    rules: [],
    source,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
  return amount === Number(match[1]) ? plan : markAIHubMixPriceConflict(plan)
}

/** /model/V3 qualifies its entire USD/image statement with the Quality tier. */
export function buildAIHubMixImageQualityPlan(
  raw: unknown,
  note: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  // Competing structured tables need their own interpretation, never discard them.
  if ((raw != null && raw !== "") || typeof note !== "string") return undefined
  const match = /^\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*IMG\s*\((Quality)\)\s*$/i.exec(
    note,
  )
  if (!match) return undefined
  return {
    usageMode: PRICING_USAGE_MODES.IMAGE,
    rates: {},
    requiresRuleMatch: true,
    rules: [
      {
        id: "image-quality",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.IMAGE_QUALITY,
            value: "Quality",
          },
        ],
        rates: {
          image: {
            amount: Number(match[1]),
            currency: "USD",
            unit: PRICE_RATE_UNITS.IMAGE,
            per: 1,
          },
        },
      },
    ],
    source,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
}

/** A full USD/hour label is converted to audio seconds, never text tokens. */
export function buildAIHubMixAudioDurationPlan(
  note: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  if (typeof note !== "string") return undefined
  const match = /^\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*h\s*$/i.exec(note)
  if (!match) return undefined
  return {
    usageMode: PRICING_USAGE_MODES.METERED,
    comparison: { meter: PRICING_METERS.AUDIO },
    rates: {
      audio: {
        amount: Number(match[1]),
        currency: "USD",
        unit: PRICE_RATE_UNITS.SECOND,
        per: 3600,
      },
    },
    rules: [],
    source,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
}
