import { expect, it } from "vitest"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_MEASUREMENT_AXES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_RANGE_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

const plan: PricingPlan = {
  rates: {},
  rules: [],
  groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
  source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
  issues: [],
}

it("explains missing image area and preserves strict published bounds", () => {
  const quote = quoteModelPrice(
    {
      ...plan,
      usageMode: PRICING_USAGE_MODES.IMAGE,
      requiresRuleMatch: true,
      rules: [
        {
          id: "size",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.MEASUREMENT,
              axis: PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS,
              gt: 1,
              lte: 4,
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
    },
    { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: {} },
  )
  expect(quote.requirementDetails).toEqual([
    {
      axis: "imageMegapixels",
      value: undefined,
      kind: "range",
      ranges: [{ min: 1, minExclusive: true, max: 4 }],
    },
  ])
})

it("explains missing seconds and invalid comparison counts using actual task values", () => {
  const video: PricingPlan = {
    ...plan,
    comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
    rates: {
      videoSeconds: {
        amount: 0.2,
        currency: "USD",
        unit: PRICE_RATE_UNITS.SECOND,
        per: 1,
      },
    },
  }
  expect(
    quoteModelPrice(video, { purpose: PRICING_PURPOSES.REQUEST, usage: {} })
      .requirementDetails,
  ).toMatchObject([{ axis: "videoSeconds", kind: "quantity" }])
  expect(
    quoteModelPrice(video, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: {},
      taskUsage: { videoSeconds: 0 },
    }).requirementDetails,
  ).toMatchObject([
    {
      axis: "videoSeconds",
      value: 0,
      ranges: [{ min: 0, minExclusive: true }],
    },
  ])
})

it("reports a model total-token limit without fabricating separate per-field limits", () => {
  const quote = quoteModelPrice(
    { ...plan, limits: { totalTokens: 100 } },
    {
      purpose: PRICING_PURPOSES.REQUEST,
      inputTokens: 80,
      outputTokens: 30,
      usage: { input: 1 },
    },
  )
  expect(quote.requirementDetails).toEqual([
    {
      axis: "totalTokens",
      value: 110,
      kind: "range",
      ranges: [{ min: 0, max: 100 }],
    },
  ])
})

it("does not silently replace cleared task quantities with defaults", () => {
  const video: PricingPlan = {
    ...plan,
    comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
    rates: {
      videoSeconds: {
        amount: 0.2,
        currency: "USD",
        unit: PRICE_RATE_UNITS.SECOND,
        per: 1,
      },
      referenceImage: {
        amount: 0.1,
        currency: "USD",
        unit: PRICE_RATE_UNITS.IMAGE,
        per: 1,
      },
    },
  }
  const cleared = quoteModelPrice(video, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    usage: {},
    taskUsage: { videoSeconds: null },
  })
  expect(cleared.amount).toBeNull()
  expect(cleared.requirementDetails).toMatchObject([
    { axis: "videoSeconds", value: null },
  ])
  const reference = quoteModelPrice(video, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    usage: {},
    taskUsage: { referenceImage: null },
  })
  expect(reference.status).not.toBe("complete")
  expect(reference.requirementDetails).toMatchObject([
    { axis: "referenceImage", value: null },
  ])
})

it("identifies the pricing-time field when no time window matches", () => {
  const quote = quoteModelPrice(
    {
      ...plan,
      requiresRuleMatch: true,
      rules: [
        {
          id: "sale",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.DATE_WINDOW,
              start: "2026-09-01T00:00:00Z",
              end: "2026-09-02T00:00:00Z",
            },
          ],
          rates: {
            request: {
              amount: 1,
              currency: "USD",
              unit: PRICE_RATE_UNITS.REQUEST,
              per: 1,
            },
          },
        },
      ],
    },
    {
      purpose: PRICING_PURPOSES.REQUEST,
      at: "2026-09-09T00:00:00Z",
      usage: { request: 1 },
    },
  )
  expect(quote.requirementDetails).toEqual([
    { axis: "at", value: "2026-09-09T00:00:00Z", kind: "time" },
  ])
})

it("does not direct people back to a numeric condition that already matches", () => {
  const quote = quoteModelPrice(
    {
      ...plan,
      requiresRuleMatch: true,
      rules: [
        {
          id: "timed",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS,
              min: 0,
              maxExclusive: 100,
            },
            {
              kind: PRICING_CONDITION_KINDS.DATE_WINDOW,
              start: "2026-09-01T00:00:00Z",
              end: "2026-09-02T00:00:00Z",
            },
          ],
          rates: {
            input: {
              amount: 1,
              currency: "USD",
              unit: PRICE_RATE_UNITS.TOKEN,
              per: TOKENS_PER_MILLION,
            },
          },
        },
      ],
    },
    {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens: 50,
      at: "2026-09-09T00:00:00Z",
      usage: { input: 1 },
    },
  )
  expect(quote.requirementDetails?.map((detail) => detail.axis)).toEqual(["at"])
})
