import type {
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
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
    usageMode: "metered",
    groupMultiplier: "included",
    source: { kind: "catalog" },
  }
  if (
    type === "speech" &&
    amount(raw.speech_input_character_cost) !== undefined
  )
    return {
      ...base,
      comparison: { meter: "characters" },
      rates: {
        characters: rate(amount(raw.speech_input_character_cost)!, "character"),
      },
    }
  if (
    type === "transcription" &&
    amount(raw.transcription_duration_cost_per_second) !== undefined
  )
    return {
      ...base,
      comparison: { meter: "audio" },
      rates: {
        audio: rate(
          amount(raw.transcription_duration_cost_per_second)!,
          "second",
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
            source: { kind: "catalog", rulesUnavailable: true },
          }
        rules.push({
          id: `size-${index}`,
          conditions: [
            ...(typeof value.size === "string"
              ? [
                  {
                    kind: "selection" as const,
                    axis: "imageSize" as const,
                    value: value.size,
                  },
                ]
              : []),
            ...(typeof value.quality === "string"
              ? [
                  {
                    kind: "selection" as const,
                    axis: "imageQuality" as const,
                    value: value.quality,
                  },
                ]
              : []),
          ],
          rates: { outputImage: rate(amount(value.cost)!, "image") },
        })
      }
    return {
      ...base,
      comparison: { meter: "image" },
      usageMode: "image",
      rates: {
        outputImage: rate(amount(raw.image)!, "image"),
        ...(amount(raw.input) !== undefined
          ? { input: rate(amount(raw.input)!, "token") }
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
          (key) => !["resolution", "cost_per_second"].includes(key),
        )
      )
        return { ...base, source: { kind: "catalog", rulesUnavailable: true } }
      const price = rate(amount(value.cost_per_second)!, "second")
      if (typeof value.resolution === "string")
        rules.push({
          id: `resolution-${index}`,
          conditions: [
            {
              kind: "selection",
              axis: "videoQuality",
              value: value.resolution,
            },
          ],
          rates: { videoSeconds: price },
        })
      else fallback = price
    }
    return {
      ...base,
      comparison: { meter: "videoSeconds" },
      rates: fallback ? { videoSeconds: fallback } : {},
      rules,
      requiresRuleMatch: !fallback,
    }
  }
  return undefined
}
