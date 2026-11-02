import { expect, it } from "vitest"

import type { ModelPricing } from "~/services/modelList/pricingModel"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { normalizePublishedSchedule } from "~/services/modelPricing/publishedPricing"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

const plan: PricingPlan = {
  rates: {
    input: { amount: 0.000001, currency: "USD", unit: "token", per: 1 },
    output: { amount: 0, currency: "USD", unit: "token", per: 1 },
  },
  rules: [],
  issues: [],
  source: { kind: "account" },
  groupMultiplier: "included",
}

it("does not claim a complete request quote from legacy token rates", () => {
  const model = {
    model_name: "legacy",
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    model_price: 0,
    enable_groups: [],
    supported_endpoint_types: [],
  } satisfies ModelPricing
  const quote = quoteCanonicalModelPrice(
    model,
    { purpose: "request", usage: { input: 10 } },
    { groupMultiplier: 1 },
  )
  expect(quote.status).toBe("partial")
  expect(quote.issues).toContainEqual({ code: "unknown-fees" })
  const unavailable = quoteCanonicalModelPrice(
    { ...model, price_metadata: { source: "none", precision: "unavailable" } },
    { purpose: "token-index", usage: { input: 1 } },
    {},
  )
  expect(unavailable.status).toBe("unavailable")
})

it("drops invalid published rates without losing valid zero prices", () => {
  const normalized = normalizePublishedSchedule([
    {
      id: "base",
      conditions: [],
      rates: {
        input: { ...plan.rates.input!, per: 0 },
        output: plan.rates.output!,
        cacheRead: { ...plan.rates.input!, amount: -1 },
      },
    },
  ])
  expect(normalized).toHaveLength(1)
  expect(normalized[0]?.rates).toEqual({
    output: { amount: 0, currency: "USD", unit: "token", per: 1000000 },
  })
})

it("reports required quantities even when no rate was published for that meter", () => {
  const result = quoteModelPrice(
    { ...plan, requiredUsage: ["image"] },
    {
      purpose: "request",
      usage: { input: 1 },
    },
  )
  expect(result.status).toBe("partial")
  expect(result.amount).toBe(0.000001)
  expect(result.issues).toContainEqual({
    code: "usage-missing",
    meter: "image",
  })
})

it.each([
  { input: -1 },
  { input: NaN },
  { input: Infinity },
  {},
  { input: 0, output: 0 },
  { input: Number.MAX_VALUE, output: Number.MAX_VALUE },
])("never ranks invalid or empty token weights %j", (usage) => {
  const result = quoteModelPrice(
    {
      ...plan,
      rates: { ...plan.rates, input: { ...plan.rates.input!, amount: 0 } },
    },
    { purpose: "token-index", usage },
  )
  expect(result.amount).toBeNull()
  expect(result.status).toBe("unavailable")
})

it("rejects monetary overflow rather than presenting an infinite price", () => {
  const result = quoteModelPrice(
    {
      ...plan,
      rates: { input: { ...plan.rates.input!, amount: Number.MAX_VALUE } },
    },
    {
      purpose: "request",
      usage: { input: 2 },
    },
  )
  expect(result).toMatchObject({
    status: "unavailable",
    amount: null,
    issues: [{ code: "price-invalid", meter: "input" }],
  })
})

it("does not amortize request free tokens in a selected-token index", () => {
  const freePlan = {
    ...plan,
    rates: { input: { ...plan.rates.input!, freeQuantity: 5 } },
  }
  expect(
    quoteModelPrice(freePlan, { purpose: "token-index", usage: { input: 10 } })
      .amount,
  ).toBeNull()
  expect(
    quoteModelPrice(freePlan, { purpose: "request", usage: { input: 10 } })
      .amount,
  ).toBeCloseTo(0.000005)
})

it("requires a conversion for CNY source prices and applies its inverse once", () => {
  const cny: PricingPlan = {
    ...plan,
    rates: {
      input: { ...plan.rates.input!, amount: 0.000007, currency: "CNY" },
    },
  }
  const scenario = { purpose: "token-index" as const, usage: { input: 1 } }
  expect(quoteModelPrice(cny, scenario).amount).toBeNull()
  expect(
    quoteModelPrice(cny, scenario, { currency: "USD", cnyPerUsd: 7 }).amount,
  ).toBe(1)
})

it("uses video output tokens instead of unrelated text weights", () => {
  const video: PricingPlan = {
    ...plan,
    usageMode: "video",
    rates: {
      videoOutput: { amount: 0.000002, currency: "USD", unit: "token", per: 1 },
    },
  }
  expect(
    quoteModelPrice(video, {
      purpose: "token-index",
      usage: { input: 100, output: 500 },
    }).amount,
  ).toBe(2)
  expect(
    quoteModelPrice(video, { purpose: "request", usage: { videoOutput: 100 } })
      .amount,
  ).toBeCloseTo(0.0002)
})

it.each(["image", "videoSeconds", "characters"] as const)(
  "keeps %s task comparison independent of hidden text weights",
  (meter) => {
    const task: PricingPlan = {
      ...plan,
      usageMode: "metered",
      comparison: { meter },
      rates: {
        [meter]: {
          amount: 2,
          currency: "USD",
          unit:
            meter === "image"
              ? "image"
              : meter === "videoSeconds"
                ? "second"
                : "character",
          per: 1,
        },
      },
    }
    const first = quoteModelPrice(task, {
      purpose: "token-index",
      usage: { input: 1, output: 0 },
      taskUsage: { [meter]: 2 },
    })
    const second = quoteModelPrice(task, {
      purpose: "token-index",
      usage: { input: 0, output: 100, cacheRead: 100 },
      taskUsage: { [meter]: 2 },
    })
    expect(first.status).toBe("complete")
    expect(second.amount).toBe(first.amount)
    expect(second.unit).toBe(first.unit)
  },
)
