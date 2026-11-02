import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_METERS,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  PRICING_VIDEO_AUDIO_MODES,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { compileExclusiveSelectionRules } from "~/services/modelPricing/selectionPricingRules"
import { isRecord } from "~/utils/core/object"

import { readVercelPrice as amount } from "./parsing"

const rate = (value: number, unit: PriceRate["unit"]): PriceRate => ({
  amount: value,
  currency: "USD",
  unit,
  per: 1,
})

/** Compile only published metering rules; never turn character/second prices into tokens. */
export function createVercelMeteredPricing(
  type: unknown,
  raw: unknown,
): PricingPlan | undefined {
  if (!isRecord(raw)) return undefined
  const base: PricingPlan = {
    issues: [],
    rates: {},
    rules: [],
    usageMode: PRICING_USAGE_MODES.METERED,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: { kind: PRICING_SOURCE_KINDS.CATALOG },
  }
  if (
    type === "speech" &&
    amount(raw.speech_input_character_cost) !== undefined
  )
    return {
      ...base,
      comparison: { meter: PRICING_METERS.CHARACTERS },
      rates: {
        characters: rate(
          amount(raw.speech_input_character_cost)!,
          PRICE_RATE_UNITS.CHARACTER,
        ),
      },
    }
  if (
    type === "transcription" &&
    amount(raw.transcription_duration_cost_per_second) !== undefined
  )
    return {
      ...base,
      comparison: { meter: PRICING_METERS.AUDIO },
      rates: {
        audio: rate(
          amount(raw.transcription_duration_cost_per_second)!,
          PRICE_RATE_UNITS.SECOND,
        ),
      },
    }
  if (type === "image" && amount(raw.image) !== undefined) {
    const rules: PricingPlan["rules"] = []
    if (Array.isArray(raw.image_dimension_quality_pricing))
      for (const [
        index,
        value,
      ] of raw.image_dimension_quality_pricing.entries()) {
        if (
          !isRecord(value) ||
          (typeof value.size !== "string" &&
            typeof value.quality !== "string") ||
          Object.keys(value).some(
            (key) => !["size", "quality", "cost"].includes(key),
          ) ||
          amount(value.cost) === undefined
        )
          return {
            ...base,
            source: {
              kind: PRICING_SOURCE_KINDS.CATALOG,
              rulesUnavailable: true,
            },
          }
        rules.push({
          id: `size-${index}`,
          conditions: [
            ...(typeof value.size === "string"
              ? [
                  {
                    kind: PRICING_CONDITION_KINDS.SELECTION,
                    axis: PRICING_SELECTION_AXES.IMAGE_SIZE,
                    value: value.size,
                  },
                ]
              : []),
            ...(typeof value.quality === "string"
              ? [
                  {
                    kind: PRICING_CONDITION_KINDS.SELECTION,
                    axis: PRICING_SELECTION_AXES.IMAGE_QUALITY,
                    value: value.quality,
                  },
                ]
              : []),
          ],
          rates: {
            outputImage: rate(amount(value.cost)!, PRICE_RATE_UNITS.IMAGE),
          },
        })
      }
    return {
      ...base,
      comparison: { meter: PRICING_METERS.IMAGE },
      usageMode: PRICING_USAGE_MODES.IMAGE,
      rates: {
        outputImage: rate(amount(raw.image)!, PRICE_RATE_UNITS.IMAGE),
        ...(amount(raw.input) !== undefined
          ? { input: rate(amount(raw.input)!, PRICE_RATE_UNITS.TOKEN) }
          : {}),
      },
      rules,
      requiresRuleMatch: rules.length > 0,
    }
  }
  if (type === "video" && Array.isArray(raw.video_duration_pricing)) {
    const rules: PricingPlan["rules"] = []
    let fallback: PriceRate | undefined
    for (const [index, value] of raw.video_duration_pricing.entries()) {
      if (
        !isRecord(value) ||
        amount(value.cost_per_second) === undefined ||
        Object.keys(value).some(
          (key) =>
            !["resolution", "mode", "audio", "cost_per_second"].includes(key),
        ) ||
        (value.resolution !== undefined &&
          (typeof value.resolution !== "string" || !value.resolution.trim())) ||
        (value.mode !== undefined &&
          (typeof value.mode !== "string" || !value.mode.trim())) ||
        (value.audio !== undefined && typeof value.audio !== "boolean")
      )
        return {
          ...base,
          source: {
            kind: PRICING_SOURCE_KINDS.CATALOG,
            rulesUnavailable: true,
          },
        }
      const price = rate(
        amount(value.cost_per_second)!,
        PRICE_RATE_UNITS.SECOND,
      )
      if (
        typeof value.resolution === "string" ||
        typeof value.audio === "boolean" ||
        typeof value.mode === "string"
      )
        rules.push({
          id: `resolution-${index}`,
          conditions: [
            ...(typeof value.mode === "string"
              ? [
                  {
                    kind: PRICING_CONDITION_KINDS.SELECTION,
                    axis: PRICING_SELECTION_AXES.VIDEO_MODE,
                    value: value.mode,
                  } as const,
                ]
              : []),
            ...(typeof value.resolution === "string"
              ? [
                  {
                    kind: PRICING_CONDITION_KINDS.SELECTION,
                    axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
                    value: value.resolution,
                  } as const,
                ]
              : []),
            ...(typeof value.audio === "boolean"
              ? [
                  {
                    kind: PRICING_CONDITION_KINDS.SELECTION,
                    axis: PRICING_SELECTION_AXES.VIDEO_AUDIO,
                    value: value.audio
                      ? PRICING_VIDEO_AUDIO_MODES.WITH_AUDIO
                      : PRICING_VIDEO_AUDIO_MODES.WITHOUT_AUDIO,
                  } as const,
                ]
              : []),
          ],
          rates: { videoSeconds: price },
        })
      else {
        if (fallback && fallback.amount !== price.amount)
          return {
            ...base,
            source: {
              kind: PRICING_SOURCE_KINDS.CATALOG,
              rulesUnavailable: true,
            },
          }
        fallback = price
      }
    }
    const compiled = compileExclusiveSelectionRules(rules)
    if (!compiled)
      return {
        ...base,
        source: { kind: PRICING_SOURCE_KINDS.CATALOG, rulesUnavailable: true },
      }
    return {
      ...base,
      comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
      rates: fallback ? { videoSeconds: fallback } : {},
      rules: compiled,
      requiresRuleMatch: !fallback,
    }
  }
  return undefined
}
