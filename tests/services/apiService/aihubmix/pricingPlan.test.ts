import { expect, it } from "vitest"

import { buildAIHubMixPricingPlan } from "~/services/apiService/aihubmix/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

it.each([
  {},
  { off_percent: 50, time_type: "absolute" },
  { off_percent: 50, time_type: "daily" },
  { off_percent: 50, time_type: "weekly", weekly: [] },
  { off_percent: 50, time_type: "daily", daily: { ranges: ["bad"] } },
  { off_percent: 50, time_type: "daily", daily: { ranges: ["24:00-25:00"] } },
  {
    off_percent: 50,
    time_type: "absolute",
    absolute: { start: "2026-09-10T00:00:00Z", end: "2026-09-09T00:00:00Z" },
  },
])("does not invent a promotion for malformed activity %j", (promotion) => {
  const plan = buildAIHubMixPricingPlan({ input: 1 }, promotion)!
  expect(
    quoteModelPrice(plan, {
      purpose: "token-index",
      usage: { input: 1 },
      at: "2026-09-09T12:00:00Z",
    }).amount,
  ).toBeNull()
})

it.each([false, "", -1, "bad"])(
  "keeps invalid catalog prices unavailable: %s",
  (input) => {
    const plan = buildAIHubMixPricingPlan({ input })!
    expect(
      quoteModelPrice(plan, { purpose: "token-index", usage: { input: 1 } })
        .amount,
    ).toBeNull()
  },
)

it("quotes an open-ended absolute promotion from its inclusive start", () => {
  const plan = buildAIHubMixPricingPlan(
    { input: "2" },
    {
      off_percent: 50,
      time_type: "absolute",
      absolute: { start: "2026-09-09T00:00:00Z" },
    },
  )!
  expect(
    quoteModelPrice(plan, {
      purpose: "token-index",
      usage: { input: 1 },
      at: "2026-09-09T00:00:00Z",
    }).amount,
  ).toBe(1)
  expect(
    quoteModelPrice(plan, {
      purpose: "token-index",
      usage: { input: 1 },
      at: "2026-09-08T23:59:59Z",
    }).amount,
  ).toBe(2)
})
