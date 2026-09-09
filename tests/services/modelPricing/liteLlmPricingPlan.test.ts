import { expect, it } from "vitest"

import { buildLiteLlmPricingPlan } from "~/services/modelPricing/liteLlmPricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

const base = { input_cost_per_token: 0.000002, output_cost_per_token: 0.000006 }
const source = "https://example.com/pricing"

it.each([
  { input_cost_per_token: "bad", tiered_pricing: [] },
  { input_cost_per_token: true, tiered_pricing: [] },
  { tiered_pricing: {} },
  { tiered_pricing: [{ range: [10, 1], input_cost_per_token: 1 }] },
  { input_cost_per_token_batches: "bad" },
  { input_cost_per_token_flex: -1 },
  { input_cost_per_token_above_9007199254740992_tokens: 1 },
  { off_peak_pricing: false },
  { off_peak_pricing: { hours_utc: "25:00-26:00" } },
  { off_peak_pricing: { hours_utc: "bad" } },
  {
    off_peak_pricing: {
      windows: [{ hours_utc: "10:00-12:00", weekdays: "mon" }],
    },
  },
  {
    off_peak_pricing: {
      windows: [{ hours_utc: "10:00-12:00", weekdays: [true] }],
    },
  },
  {
    off_peak_pricing: {
      windows: [{ hours_utc: "10:00-12:00", weekdays: [8] }],
    },
  },
])("does not rank malformed published pricing: %j", (entry) => {
  const plan = buildLiteLlmPricingPlan({ ...base, ...entry }, source)!
  expect(
    quoteModelPrice(
      plan,
      {
        purpose: "token-index",
        inputTokens: 100,
        usage: { input: 1 },
        at: "2026-09-07T11:00:00Z",
      },
      { groupMultiplier: 1 },
    ).amount,
  ).toBeNull()
})

it("keeps interval-table precedence over service-tier overrides", () => {
  const plan = buildLiteLlmPricingPlan(
    {
      ...base,
      input_cost_per_token_flex: 0.00001,
      tiered_pricing: [
        {
          range: [0, 1000],
          input_cost_per_token: "0.000004",
          cache_creation_input_token_cost_above_1hr: 0.000008,
        },
      ],
    },
    source,
  )!
  expect(
    quoteModelPrice(
      plan,
      {
        purpose: "token-index",
        serviceTier: "flex",
        inputTokens: 100,
        usage: { input: 1, output: 1, cacheWrite1h: 1 },
      },
      { groupMultiplier: 1 },
    ).amount,
  ).toBe(6)
})

it.each(["xai", "other"])(
  "sorts multiple %s context thresholds and applies their boundary convention",
  (litellm_provider) => {
    const plan = buildLiteLlmPricingPlan(
      {
        ...base,
        litellm_provider,
        input_cost_per_token_above_200_tokens: 0.000006,
        input_cost_per_token_above_100_tokens: 0.000004,
      },
      source,
    )!
    const offset = litellm_provider === "xai" ? 0 : 1
    const quote = (inputTokens: number) =>
      quoteModelPrice(
        plan,
        { purpose: "token-index", inputTokens, usage: { input: 1 } },
        { groupMultiplier: 1 },
      ).amount
    expect(quote(100 + offset - 1)).toBe(2)
    expect(quote(100 + offset)).toBe(4)
    expect(quote(200 + offset - 1)).toBe(4)
    expect(quote(200 + offset)).toBe(6)
  },
)

it("halves standard prompt and cache prices when only batch output is explicit", () => {
  const plan = buildLiteLlmPricingPlan(
    {
      ...base,
      cache_read_input_token_cost: 0.000001,
      cache_creation_input_token_cost: 0.000004,
      output_cost_per_token_batches: "0.000003",
    },
    source,
  )!
  expect(
    quoteModelPrice(
      plan,
      {
        purpose: "token-index",
        serviceTier: "batch",
        usage: { input: 1, cacheRead: 1, cacheWrite: 1, output: 1 },
      },
      { groupMultiplier: 1 },
    ).amount,
  ).toBe(1.625)
})

it("applies weekday windows with a UTC fallback for an invalid weekday timezone", () => {
  const plan = buildLiteLlmPricingPlan(
    {
      ...base,
      off_peak_pricing: {
        weekday_timezone: "invalid-zone",
        input_cost_per_token: 0.000001,
        windows: [{ hours_utc: ["10:00-12:00"], weekdays: ["mon", 7] }],
      },
    },
    source,
  )!
  const quote = (at: string) =>
    quoteModelPrice(
      plan,
      {
        purpose: "token-index",
        usage: { input: 1 },
        at,
      },
      { groupMultiplier: 1 },
    )
  expect(quote("2026-09-07T11:00:00Z").amount).toBe(1)
  expect(quote("2026-09-08T11:00:00Z").amount).toBe(2)
})

it("keeps unverified off-peak reasoning output unavailable while input remains usable", () => {
  const plan = buildLiteLlmPricingPlan(
    {
      ...base,
      off_peak_pricing: {
        hours_utc: "10:00-12:00",
        input_cost_per_token: 0.000001,
        output_cost_per_reasoning_token: 0.00001,
      },
    },
    source,
  )!
  const quote = (usage: { input?: number; output?: number }) =>
    quoteModelPrice(
      plan,
      {
        purpose: "token-index",
        usage,
        at: "2026-09-07T11:00:00Z",
      },
      { groupMultiplier: 1 },
    )
  expect(quote({ input: 1 }).amount).toBe(1)
  expect(quote({ output: 1 }).amount).toBeNull()
})
