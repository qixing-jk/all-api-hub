import { z } from "zod"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_MEASUREMENT_AXES,
  PRICING_METERS,
  PRICING_SELECTION_AXES,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { isRecord } from "~/utils/core/object"

const price = z.number().finite().nonnegative()
const bound = z.number().int().nonnegative()
const imageSchema = z.strictObject({
  model_name: z.string(),
  enabled_billing_items: z.array(z.enum(["image_generation", "image_input"])),
  metered_price_config: z.strictObject({
    image_generation: z.strictObject({
      unit: z.literal("image"),
      fallback_unit_price: price,
      price_rules: z
        .array(
          z.strictObject({
            match: z.union([
              z.strictObject({ size: z.string().min(1) }),
              z.strictObject({
                megapixels: z.strictObject({
                  gt: price.optional(),
                  lte: price.optional(),
                }),
              }),
              z.strictObject({
                long_edge_px: z.strictObject({
                  gt: bound.optional(),
                  lte: bound.optional(),
                }),
              }),
            ]),
            unit_price: price,
          }),
        )
        .max(128),
    }),
    image_input: z
      .strictObject({
        unit: z.literal("image"),
        fallback_unit_price: price,
        free_quantity: bound.optional(),
      })
      .optional(),
  }),
})

/**
 * /call/mdl_info, verified 2026-09-09: image_generation rates settle per output
 * image, selected by size or long edge; reference-image charges are separate.
 * Only compile unambiguous standard sizes, never infer a rate from model names.
 */
export function buildAIHubMixMeteredImagePlan(
  raw: unknown,
  source: PricingPlan["source"],
): PricingPlan | undefined {
  if (
    !isRecord(raw) ||
    !isRecord(raw.metered_price_config) ||
    !isRecord(raw.metered_price_config.image_generation)
  )
    return undefined
  const unsupported: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.IMAGE,
    rates: {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: { ...source, rulesUnavailable: true },
    issues: [
      {
        code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
        reason: PRICING_ISSUE_REASONS.TASK_USAGE,
      },
    ],
  }
  const parsed = imageSchema.safeParse(raw)
  if (
    !parsed.success ||
    !parsed.data.enabled_billing_items.includes("image_generation")
  )
    return unsupported
  const generation = parsed.data.metered_price_config.image_generation
  const hasUniformPrice = generation.price_rules.every(
    (rule) => rule.unit_price === generation.fallback_unit_price,
  )
  const rules: PricingPlan["rules"] = []
  const areaRules = generation.price_rules.filter(
    ({ match }) => "megapixels" in match,
  )
  if (areaRules.length && areaRules.length !== generation.price_rules.length)
    return unsupported
  for (let index = 0; index < areaRules.length; index++) {
    const current = areaRules[index].match
    if (!("megapixels" in current)) continue
    if (
      current.megapixels.gt !== undefined &&
      current.megapixels.lte !== undefined &&
      current.megapixels.gt >= current.megapixels.lte
    )
      return unsupported
    for (const next of areaRules.slice(index + 1)) {
      if (!("megapixels" in next.match)) continue
      if (
        Math.max(
          current.megapixels.gt ?? -Infinity,
          next.match.megapixels.gt ?? -Infinity,
        ) <
        Math.min(
          current.megapixels.lte ?? Infinity,
          next.match.megapixels.lte ?? Infinity,
        )
      )
        return unsupported
    }
  }
  for (const [index, rule] of areaRules.entries()) {
    if (!("megapixels" in rule.match)) continue
    rules.push({
      id: `area-${index}`,
      conditions: [
        {
          kind: PRICING_CONDITION_KINDS.MEASUREMENT,
          axis: PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS,
          ...rule.match.megapixels,
        },
      ],
      rates: {
        image: {
          amount: rule.unit_price,
          currency: "USD",
          unit: PRICE_RATE_UNITS.IMAGE,
          per: 1,
        },
      },
    })
  }
  if (!areaRules.length)
    for (const [size, edge] of [
      [PRICING_IMAGE_SIZES.K1, 1024],
      [PRICING_IMAGE_SIZES.K2, 2048],
      [PRICING_IMAGE_SIZES.K3, 3072],
      [PRICING_IMAGE_SIZES.K4, 4096],
    ] as const) {
      const matching = generation.price_rules.filter(({ match }) => {
        if ("size" in match)
          return (
            match.size.toLowerCase() === size ||
            match.size === `${edge}x${edge}`
          )
        return (
          "long_edge_px" in match &&
          (match.long_edge_px.gt === undefined ||
            edge > match.long_edge_px.gt) &&
          (match.long_edge_px.lte === undefined ||
            edge <= match.long_edge_px.lte)
        )
      })
      if (new Set(matching.map((rule) => rule.unit_price)).size > 1)
        return unsupported
      // Exact-size lists only establish their listed sizes. A fallback is not
      // evidence that a missing standard size is supported by the model.
      if (
        !matching.length &&
        generation.price_rules.some(({ match }) => "size" in match)
      )
        continue
      rules.push({
        id: size,
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.IMAGE_SIZE,
            value: size,
          },
        ],
        rates: {
          image: {
            amount: matching[0]?.unit_price ?? generation.fallback_unit_price,
            currency: "USD",
            unit: PRICE_RATE_UNITS.IMAGE,
            per: 1,
          },
        },
      })
    }
  if (!rules.length) return unsupported
  const hasInputCharges =
    parsed.data.enabled_billing_items.includes("image_input")
  const input = parsed.data.metered_price_config.image_input
  const missingInputPrice = hasInputCharges && !input
  return {
    usageMode: PRICING_USAGE_MODES.IMAGE,
    comparison: { meter: PRICING_METERS.IMAGE },
    rates:
      hasInputCharges && input
        ? {
            referenceImage: {
              amount: input.fallback_unit_price,
              currency: "USD",
              unit: PRICE_RATE_UNITS.IMAGE,
              per: 1,
              freeQuantity: input.free_quantity ?? 0,
            },
          }
        : {},
    // A dimension that cannot change the price is not a required quote input.
    // Compare every native rule, including nonstandard sizes, and the fallback.
    rules: hasUniformPrice
      ? [{ id: "flat", conditions: [], rates: rules[0].rates }]
      : rules,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    requiresRuleMatch: true,
    source: { ...source, hasUnpricedCharges: missingInputPrice },
    issues: missingInputPrice
      ? [
          {
            code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
            meters: [PRICING_METERS.REFERENCE_IMAGE],
          },
        ]
      : [],
  }
}
