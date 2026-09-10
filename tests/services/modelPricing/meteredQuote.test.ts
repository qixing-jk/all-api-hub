import { describe, expect, it } from "vitest"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_MEASUREMENT_AXES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import {
  pricingPlanSchema,
  type PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

const plan: PricingPlan = {
  usageMode: PRICING_USAGE_MODES.METERED,
  comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
  rates: {
    videoSeconds: {
      amount: 0.1,
      currency: "USD",
      unit: PRICE_RATE_UNITS.SECOND,
      per: 1,
    },
    referenceImage: {
      amount: 0.02,
      currency: "USD",
      unit: PRICE_RATE_UNITS.IMAGE,
      per: 1,
      freeQuantity: 3,
    },
  },
  rules: [],
  source: { kind: PRICING_SOURCE_KINDS.CATALOG },
  groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
  issues: [],
}

describe("metered task pricing", () => {
  it("rejects an overflowing normalized price", () => {
    expect(
      quoteModelPrice(
        {
          ...plan,
          rates: {
            ...plan.rates,
            referenceImage: {
              amount: 1e100,
              currency: "USD",
              unit: PRICE_RATE_UNITS.IMAGE,
              per: 1,
            },
          },
        },
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: {},
          taskUsage: { videoSeconds: 1e-300, referenceImage: 1 },
        },
        { groupMultiplier: 1 },
      ),
    ).toMatchObject({
      amount: null,
      status: "unavailable",
      issues: [{ code: "price-invalid" }],
    })
  })
  it("sums different units after applying the task allowance and currency/group factors", () => {
    const quote = quoteModelPrice(
      pricingPlanSchema.parse(plan),
      {
        purpose: PRICING_PURPOSES.REQUEST,
        usage: { videoSeconds: 5, referenceImage: 5 },
      },
      { groupMultiplier: 2, currency: "CNY", cnyPerUsd: 7 },
    )
    expect(quote).toMatchObject({ status: "complete", unit: "request" })
    expect(quote.amount).toBeCloseTo(7.56)
    expect(quote.lines[1]).toMatchObject({
      meter: "referenceImage",
      quantity: 5,
      billableQuantity: 2,
    })
  })

  it("amortizes task extras over the actual output duration instead of treating seconds as token weights", () => {
    const quote = quoteModelPrice(
      plan,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 90, output: 10 },
        taskUsage: { videoSeconds: 5, referenceImage: 5 },
      },
      { groupMultiplier: 1 },
    )
    expect(quote).toMatchObject({ status: "complete", unit: "video-second" })
    expect(quote.amount).toBeCloseTo(0.108)
    expect(quote.lines.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(
      quote.amount!,
    )
  })

  it("requires actual request quantities and rejects zero comparison outputs", () => {
    expect(
      quoteModelPrice(
        plan,
        { purpose: PRICING_PURPOSES.REQUEST, usage: { videoSeconds: 5 } },
        { groupMultiplier: 1 },
      ).issues,
    ).toContainEqual({ code: "usage-missing", meter: "referenceImage" })
    expect(
      quoteModelPrice(
        plan,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: {},
          taskUsage: { videoSeconds: 0 },
        },
        { groupMultiplier: 1 },
      ).status,
    ).toBe("unavailable")
  })

  it("uses continuous pixel area boundaries without inferring area from an image size label", () => {
    const image: PricingPlan = {
      ...plan,
      comparison: { meter: PRICING_METERS.IMAGE },
      rates: {},
      rules: [
        {
          id: "small",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.MEASUREMENT,
              axis: PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS,
              lte: 2.36,
            },
          ],
          rates: {
            image: {
              amount: 0.05,
              currency: "USD",
              unit: PRICE_RATE_UNITS.IMAGE,
              per: 1,
            },
          },
        },
        {
          id: "large",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.MEASUREMENT,
              axis: PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS,
              gt: 2.36,
            },
          ],
          rates: {
            image: {
              amount: 0.1,
              currency: "USD",
              unit: PRICE_RATE_UNITS.IMAGE,
              per: 1,
            },
          },
        },
      ],
    }
    expect(
      quoteModelPrice(
        image,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: {},
          imageSize: PRICING_IMAGE_SIZES.K2,
        },
        { groupMultiplier: 1 },
      ).amount,
    ).toBeNull()
    for (const [imageMegapixels, amount] of [
      [2.36, 0.05],
      [2.360001, 0.1],
    ]) {
      expect(
        quoteModelPrice(
          image,
          { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: {}, imageMegapixels },
          { groupMultiplier: 1 },
        ),
      ).toMatchObject({ status: "complete", amount })
    }
  })
})
