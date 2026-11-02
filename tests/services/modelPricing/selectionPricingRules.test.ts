import { describe, expect, it } from "vitest"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_MEASUREMENT_AXES,
  PRICING_SELECTION_AXES,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import {
  compileExclusiveSelectionRules,
  compileExclusiveVariantRules,
} from "~/services/modelPricing/selectionPricingRules"

const variant = (
  id: string,
  quality: string,
  duration?: number,
): PricingPlan["rules"][number] => ({
  id,
  conditions: [
    {
      kind: PRICING_CONDITION_KINDS.SELECTION,
      axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
      value: quality,
    },
    ...(duration === undefined
      ? []
      : [
          {
            kind: PRICING_CONDITION_KINDS.MEASUREMENT,
            axis: PRICING_MEASUREMENT_AXES.VIDEO_SECONDS,
            eq: duration,
          } as const,
        ]),
  ],
  rates: {
    videoSeconds: {
      amount: 0.2,
      per: 1,
      currency: "USD",
      unit: PRICE_RATE_UNITS.SECOND,
    },
  },
})

describe("exclusive published variants", () => {
  it("rejects unbounded, malformed and duplicate variant predicates", () => {
    const rate = variant("test", "720p").rates
    const conditions = [
      [],
      [{ kind: "range", axis: "context", min: 0 }],
      [{ kind: "measurement", axis: "videoSeconds", gt: 5 }],
      [{ kind: "measurement", axis: "videoSeconds", eq: -1 }],
      [{ kind: "measurement", axis: "videoSeconds", eq: Infinity }],
      [{ kind: "measurement", axis: "videoSeconds", eq: 5, lte: 10 }],
      [{ kind: "selection", axis: "videoMode", value: " " }],
      [
        { kind: "selection", axis: "videoMode", value: "fast" },
        { kind: "selection", axis: "videoMode", value: "slow" },
      ],
    ]
    for (const predicates of conditions) {
      expect(
        compileExclusiveVariantRules([
          { id: "invalid", conditions: predicates as any, rates: rate },
        ]),
      ).toBeUndefined()
    }
    expect(
      compileExclusiveVariantRules([
        {
          id: "mode",
          conditions: [
            { kind: "selection", axis: "videoMode", value: " fast " },
          ],
          rates: rate,
        },
      ])?.[0]?.conditions,
    ).toEqual([{ kind: "selection", axis: "videoMode", value: "fast" }])
  })
  it("normalizes duplicate selectors while preserving the first rule and source records", () => {
    const first = variant("first", "720P")
    const duplicate = variant("duplicate", "720p")
    const input = [first, duplicate, variant("other", "1080p")]
    const snapshot = structuredClone(input)
    const compiled = compileExclusiveVariantRules(input)
    expect(compiled?.map(({ id }) => id)).toEqual(["first", "other"])
    expect(compiled?.[0]?.conditions[0]).toMatchObject({ value: "720p" })
    expect(input).toEqual(snapshot)
  })

  it("accepts disjoint exact measurements but keeps them outside selection-only tables", () => {
    const rules = [variant("short", "720p", 5), variant("long", "720p", 10)]
    expect(compileExclusiveVariantRules(rules)).toEqual(rules)
    expect(compileExclusiveSelectionRules(rules)).toBeUndefined()
  })

  it("deduplicates identical rates independently of object property order", () => {
    const first = variant("first", "720p")
    const duplicate = variant("duplicate", "720p")
    duplicate.rates.videoSeconds = {
      unit: PRICE_RATE_UNITS.SECOND,
      currency: "USD",
      per: 1,
      amount: 0.2,
    }
    expect(compileExclusiveVariantRules([first, duplicate])).toEqual([first])
    expect(compileExclusiveVariantRules([duplicate, first])).toEqual([
      duplicate,
    ])
    for (const difference of [
      { amount: 0.3 },
      { per: 2 },
      { currency: "CNY" as const },
      { freeQuantity: 1 },
    ]) {
      const different = {
        ...duplicate,
        rates: {
          videoSeconds: { ...duplicate.rates.videoSeconds, ...difference },
        },
      }
      expect(compileExclusiveVariantRules([first, different])).toBeUndefined()
      expect(compileExclusiveVariantRules([different, first])).toBeUndefined()
    }
  })

  it("rejects overlapping selectors and unequal duplicate rates regardless of row order", () => {
    const base = variant("base", "720p")
    const moreSpecific = variant("specific", "720p", 5)
    const differentRate = {
      ...base,
      rates: { videoSeconds: { ...base.rates.videoSeconds!, amount: 0.3 } },
    }
    for (const other of [moreSpecific, differentRate]) {
      expect(compileExclusiveVariantRules([base, other])).toBeUndefined()
      expect(compileExclusiveVariantRules([other, base])).toBeUndefined()
    }
  })
})
