import { describe, expect, it } from "vitest"

import { buildAIHubMixWebsitePricingPlan } from "~/services/apiService/aihubmix/websitePricing"
import {
  PRICING_IMAGE_SIZES,
  PRICING_PURPOSES,
} from "~/services/modelPricing/pricingConstants"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

import meteredBillingFixtures from "./meteredBillingFixtures.json"
import websiteBillingFixtures from "./websiteBillingFixtures.json"

// Public /call/mdl_info/qwen-flash and model page, verified 2026-09-09.
const billing = {
  model_name: "qwen-flash",
  default_tier: "tier1",
  enabled_billing_items: [
    "prompt_tokens",
    "completion_tokens",
    "cached_tokens",
  ],
  token_based_tier_configs: Object.fromEntries(
    [
      [0, 128000, 0.010273],
      [128001, 256000, 0.041096],
      [256001, 1000000, 0.082191],
    ].map(([min, max, ratio], index) => [
      `tier${index + 1}`,
      {
        model_ratio: ratio,
        tier_condition: { min_tokens: min, max_tokens: max },
        prompt_tokens_ratio: 1,
        completion_tokens_ratio: 10,
      },
    ]),
  ),
}

const scenario = (inputTokens: number) => ({
  purpose: PRICING_PURPOSES.REQUEST,
  inputTokens,
  usage: {
    input: inputTokens,
    output: 1000,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
  },
})

describe("AIHubMix website pricing", () => {
  it.each([
    { default_tier: "missing" },
    { token_based_tier_configs: {} },
    { per_unit_price_config: { unknown_charge: 1 } },
    { per_unit_price_config: { image_price: -1 } },
  ])(
    "does not infer website prices from an incomplete configuration %j",
    (extension) => {
      const plan = buildAIHubMixWebsitePricingPlan("renamed", {
        ...billing,
        ...extension,
      })
      expect(quoteModelPrice(plan, scenario(100))).toMatchObject({
        status: "unavailable",
        amount: null,
      })
    },
  )
  it("rejects a malformed promotion instead of using undiscounted website tiers", () => {
    const plan = buildAIHubMixWebsitePricingPlan("renamed", billing, {
      invalid: true,
    })
    expect(quoteModelPrice(plan, scenario(100))).toMatchObject({
      status: "unavailable",
      amount: null,
    })
  })
  it("keeps text and audio input/output token prices independent", () => {
    // Aihubmix /call/mdl_info gpt-audio-1.5, verified 2026-09-09.
    const config = {
      model_name: "renamed-audio",
      default_tier: "tier1",
      enabled_billing_items: [
        "prompt_tokens",
        "completion_tokens",
        "input_audio_tokens",
        "output_audio_tokens",
      ],
      token_based_tier_configs: {
        tier1: {
          tier_condition: { min_tokens: 0, max_tokens: -1 },
          model_ratio: 1.25,
          prompt_tokens_ratio: 1,
          completion_tokens_ratio: 4,
          input_audio_tokens_ratio: 12.8,
          output_audio_tokens_ratio: 25.6,
        },
      },
    }
    const plan = buildAIHubMixWebsitePricingPlan("renamed-audio", config)
    expect(plan.rules[0]?.rates).toMatchObject({
      input: { amount: 2.5 },
      output: { amount: 10 },
      audioInput: { amount: 32 },
      audioOutput: { amount: 64 },
    })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1, output: 1 },
      }),
    ).toMatchObject({ status: "complete", amount: 6.25 })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { audioInput: 1, audioOutput: 1 },
      }),
    ).toMatchObject({ status: "complete", amount: 48 })
  })
  it.each([
    ["agnes-image-2.1-flash", PRICING_IMAGE_SIZES.K1, 0.01],
    ["agnes-image-2.1-flash", PRICING_IMAGE_SIZES.K3, 0.021],
    ["qwen-image-3.0", PRICING_IMAGE_SIZES.K2, 0.02535],
    ["qwen-image-3.0-pro", PRICING_IMAGE_SIZES.K1, 0.03572],
    ["qwen-image-3.0-pro", PRICING_IMAGE_SIZES.K2, 0.07143],
  ] as const)(
    "quotes output images for %s at %s",
    (model, imageSize, amount) => {
      const config = meteredBillingFixtures.find(
        (row) => row.model === model,
      )!.billing
      const plan = buildAIHubMixWebsitePricingPlan("renamed", config)
      expect(
        quoteModelPrice(plan, {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          imageSize,
          usage: { input: 1, output: 1 },
        }),
      ).toMatchObject({
        status: "complete",
        unit: "image",
        amount,
        source: { hasUnpricedCharges: false },
      })
      expect(
        quoteModelPrice(plan, {
          purpose: PRICING_PURPOSES.REQUEST,
          imageSize,
          usage: { image: 1 },
        }).status,
      ).toBe("partial")
    },
  )
  it("does not require image size when every published rate and fallback agree", () => {
    const config = meteredBillingFixtures.find(
      (row) => row.model === "qwen-image-3.0",
    )!.billing
    const plan = buildAIHubMixWebsitePricingPlan("renamed", config)
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1 },
      }),
    ).toMatchObject({
      status: "complete",
      unit: "image",
      amount: 0.02535,
    })
    const varied = structuredClone(config)
    varied.metered_price_config!.image_generation!.fallback_unit_price = 0.5
    expect(
      quoteModelPrice(buildAIHubMixWebsitePricingPlan("renamed", varied), {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1 },
      }).status,
    ).toBe("unavailable")
  })
  it("requires image size and rejects conflicting size aliases or extra billing dimensions", () => {
    const config = structuredClone(
      meteredBillingFixtures.find(
        (row) => row.model === "agnes-image-2.1-flash",
      )!.billing,
    )
    const plan = buildAIHubMixWebsitePricingPlan("renamed", config)
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { image: 1 },
      }).status,
    ).toBe("unavailable")
    config.metered_price_config!.image_generation!.price_rules[1].unit_price = 0.5
    expect(
      buildAIHubMixWebsitePricingPlan("renamed", config).source
        .rulesUnavailable,
    ).toBe(true)
    config.metered_price_config!.image_generation!.price_rules[1].unit_price = 0.01
    expect(
      buildAIHubMixWebsitePricingPlan("renamed", {
        ...config,
        reserve_price_config: { unit: "request", unit_price: 5 },
      }).source.rulesUnavailable,
    ).toBe(true)
  })
  it("retains text prices while refusing to guess between explicit and implicit cache prices", () => {
    const config = meteredBillingFixtures.find(
      (row) => row.model === "qwen3.8-max-preview",
    )!.billing
    const plan = buildAIHubMixWebsitePricingPlan("renamed", config)
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens: 1000,
        usage: { input: 1, output: 1 },
      }),
    ).toMatchObject({ status: "complete", amount: 0.676 })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens: 1000,
        usage: { cacheRead: 1 },
      }).status,
    ).toBe("unavailable")
  })
  // Public /call/mdl_info snapshot, 2026-09-09; only billing fields are retained.
  it.each(
    websiteBillingFixtures.filter(
      (row) => "token_based_tier_configs" in row.billing,
    ),
  )("quotes published token rules for $model", ({ model, billing: config }) => {
    const plan = buildAIHubMixWebsitePricingPlan(model, config)
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        at: "2026-09-09T12:00:00Z",
        usage: { input: 1 },
      }),
    ).toMatchObject({ status: "complete", unit: "million-selected-tokens" })
  })
  it("coalesces equal cache-write aliases and rejects conflicting prices", () => {
    const config = structuredClone(websiteBillingFixtures[0].billing)
    const plan = buildAIHubMixWebsitePricingPlan("renamed-model", config)
    const quote = quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { cacheWrite: 1, cacheWrite1h: 1 },
    })
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBe(17.875)
    expect(quote.lines).toHaveLength(2)
    config.token_based_tier_configs!.tier1.cache_write_5_minutes_tokens_ratio = 9
    expect(
      buildAIHubMixWebsitePricingPlan("renamed-model", config).source
        .rulesUnavailable,
    ).toBe(true)
  })
  it.each([
    ["2026-09-09T00:59:59Z", 0.2324],
    ["2026-09-09T01:00:00Z", 0.4648],
    ["2026-09-09T04:00:00Z", 0.2324],
    ["2026-09-09T06:00:00Z", 0.4648],
    ["2026-09-09T10:00:00Z", 0.2324],
  ])("selects the configured time tier at %s", (at, amount) => {
    const config = websiteBillingFixtures.find(
      (row) => row.model === "deepseek-v4-flash-vision-exp",
    )!.billing
    const plan = buildAIHubMixWebsitePricingPlan("renamed-model", config)
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        at,
        usage: { input: 1 },
      }),
    ).toMatchObject({ status: "complete", amount })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1 },
      }).status,
    ).toBe("unavailable")
  })
  it("preserves distinct text and image token meters without treating tokens as images", () => {
    const config = websiteBillingFixtures.find(
      (row) => row.model === "gpt-image-2.5-flare",
    )!.billing
    const plan = buildAIHubMixWebsitePricingPlan("renamed-model", config)
    expect(plan.rules[0].rates).toMatchObject({
      input: { amount: 5 },
      output: { amount: 10 },
      imageInput: { amount: 8 },
      imageOutput: { amount: 30 },
    })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { imageInput: 1, imageOutput: 1 },
      }),
    ).toMatchObject({
      status: "complete",
      amount: 19,
      unit: "million-selected-tokens",
    })
  })
  it.each(["23:00-02:00", "25:00-26:00", "01:00-01:00", "invalid"])(
    "does not guess unsupported time range semantics for %s",
    (range) => {
      const config = structuredClone(
        websiteBillingFixtures.find(
          (row) => row.model === "deepseek-v4-flash-vision-exp",
        )!.billing,
      )
      config.token_based_tier_configs!.peak!.time_condition.ranges = [range]
      expect(
        buildAIHubMixWebsitePricingPlan("renamed-model", config).source
          .rulesUnavailable,
      ).toBe(true)
    },
  )
  it("keeps per-second video settlement out of token comparison", () => {
    const config = websiteBillingFixtures.find(
      (row) => row.model === "minimax-h3-max",
    )!.billing
    expect(
      quoteModelPrice(
        buildAIHubMixWebsitePricingPlan("renamed-model", config),
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: { input: 1, output: 1 },
        },
      ),
    ).toMatchObject({
      status: "unavailable",
      amount: null,
      unit: "video-second",
    })
  })
  it("retains selected token prices when independent add-on charges are unpriced", () => {
    const plan = buildAIHubMixWebsitePricingPlan("example", {
      model_name: "example",
      default_tier: "tier1",
      enabled_billing_items: [
        "prompt_tokens",
        "completion_tokens",
        "cached_tokens",
        "image_generation",
        "web_search_requests",
        "cache_storage_hours",
        "input_video_tokens",
        "input_audio_tokens",
      ],
      per_unit_price_config: {
        web_search_price: 0.014,
        cache_storage_price: 1,
      },
      token_based_tier_configs: {
        tier1: {
          model_ratio: 0.375,
          completion_tokens_ratio: 5,
          cached_tokens_ratio: 0.1,
          input_video_tokens_ratio: 1,
          input_audio_tokens_ratio: 1,
          tier_condition: { min_tokens: 0, max_tokens: -1 },
        },
      },
    })
    const quote = quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 1, output: 1 },
    })
    expect(quote).toMatchObject({
      status: "complete",
      amount: 2.25,
      source: { hasUnpricedCharges: true },
    })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.REQUEST,
        usage: { input: 1000, output: 1000, request: 1 },
      }).status,
    ).not.toBe("complete")
  })
  it.each([
    [32000, 0.020546],
    [128001, 0.082192],
  ])(
    "quotes the selected input/output mix at reference length %i",
    (inputTokens, rate) => {
      const plan = buildAIHubMixWebsitePricingPlan(
        "qwen-flash",
        JSON.stringify(billing),
      )
      const quote = quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens,
        usage: { input: 80, output: 20, cacheRead: null, cacheWrite: 0 },
      })
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(rate * 0.8 + rate * 10 * 0.2, 10)
    },
  )

  it("quotes an unconditional tier with explicit cache meters, including zero prices and promotions", () => {
    const plan = buildAIHubMixWebsitePricingPlan(
      "cached-model",
      JSON.stringify({
        model_name: "cached-model",
        default_tier: "tier1",
        token_based_tier_configs: {
          tier1: {
            model_ratio: 0,
            completion_tokens_ratio: 2,
            cached_tokens_ratio: 0.1,
            cache_write_1_hour_tokens_ratio: 2,
            tier_condition: { min_tokens: 0, max_tokens: -1 },
          },
        },
      }),
      {
        off_percent: 50,
        time_type: "daily",
        daily: { ranges: ["00:00-23:59"] },
      },
    )
    const quote = quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      at: "2026-09-09T12:00:00Z",
      usage: { input: 1, output: 1, cacheRead: 1, cacheWrite1h: 1 },
    })
    expect(quote.amount).toBe(0)
    expect(quote.status).toBe("complete")
    expect(quote.lines).toHaveLength(4)
  })

  it("rejects overlapping tiers instead of letting rule order decide the price", () => {
    const config = structuredClone(billing)
    config.token_based_tier_configs.tier2.tier_condition.min_tokens = 128000
    const plan = buildAIHubMixWebsitePricingPlan(
      "qwen-flash",
      JSON.stringify(config),
    )
    expect(quoteModelPrice(plan, scenario(128000)).amount).toBeNull()
    expect(plan.source.rulesUnavailable).toBe(true)
  })
  it.each([
    [128000, 0.020546],
    [128001, 0.082192],
    [256000, 0.082192],
    [256001, 0.164382],
    [1000000, 0.164382],
  ])(
    "uses the website tier at %i input tokens without rounding its rates",
    (input, rate) => {
      const plan = buildAIHubMixWebsitePricingPlan(
        "qwen-flash",
        JSON.stringify(billing),
      )
      const quote = quoteModelPrice(plan, scenario(input))
      expect(quote.amount).toBeCloseTo(
        (input * rate + 1000 * rate * 10) / 1e6,
        10,
      )
      expect(quote.matchedRules).toHaveLength(1)
      expect(quote.source.url).toBe(
        "https://aihubmix.com/model/qwen-flash#pricing",
      )
      expect(quote.source.label).toBe("Aihubmix")
    },
  )

  it("does not assume a cache rate or quote an out-of-range request", () => {
    const plan = buildAIHubMixWebsitePricingPlan(
      "qwen-flash",
      JSON.stringify(billing),
    )
    expect(plan.rules.every((rule) => !rule.rates.cacheRead)).toBe(true)
    expect(quoteModelPrice(plan, scenario(1000001)).amount).toBeNull()
    expect(
      quoteModelPrice(plan, {
        ...scenario(1000),
        usage: { input: 1000, cacheRead: 1 },
      }).amount,
    ).toBeNull()
  })

  it.each([
    "{broken",
    JSON.stringify({
      ...billing,
      token_based_tier_configs: {
        tier1: {
          ...billing.token_based_tier_configs.tier1,
          time_condition: { ranges: ["00:00-12:00"] },
        },
      },
    }),
  ])("keeps unparsed billing rules out of a complete quote", (config) => {
    const plan = buildAIHubMixWebsitePricingPlan("qwen-flash", config)
    expect(quoteModelPrice(plan, scenario(1000)).amount).toBeNull()
    expect(plan.issues).toContainEqual({ code: "unsupported-rule" })
  })

  it("applies promotions to the matched tier, never the simplified catalog rate", () => {
    const plan = buildAIHubMixWebsitePricingPlan(
      "qwen-flash",
      JSON.stringify(billing),
      {
        off_percent: 50,
        time_type: "absolute",
        absolute: {
          start: "2026-09-01T00:00:00Z",
          end: "2026-10-01T00:00:00Z",
        },
      },
    )
    const quote = quoteModelPrice(plan, {
      ...scenario(128001),
      at: "2026-09-09T00:00:00Z",
    })
    expect(quote.amount).toBeCloseTo(
      (128001 * 0.082192 + 1000 * 0.82192) / 2e6,
      10,
    )
    expect(
      quoteModelPrice(plan, {
        ...scenario(1000001),
        at: "2026-09-09T00:00:00Z",
      }).amount,
    ).toBeNull()
  })
})

it("uses strict output boundaries independently of inclusive input ranges", () => {
  const plan = buildAIHubMixWebsitePricingPlan("generic", {
    model_name: "generic",
    default_tier: "a",
    token_based_tier_configs: {
      a: {
        model_ratio: 1,
        completion_tokens_ratio: 2,
        tier_condition: { min_tokens: 0, max_tokens: 32000 },
        output_tier_condition: { min_tokens: 0, max_tokens: 200 },
      },
      b: {
        model_ratio: 1,
        completion_tokens_ratio: 4,
        tier_condition: { min_tokens: 0, max_tokens: 32000 },
        output_tier_condition: { min_tokens: 200, max_tokens: 32000 },
      },
      c: {
        model_ratio: 2,
        completion_tokens_ratio: 4,
        tier_condition: { min_tokens: 32001, max_tokens: -1 },
      },
    },
  })
  for (const [inputTokens, outputTokens, amount] of [
    [32000, 200, 4],
    [32000, 201, 8],
    [32001, 200, 16],
  ]) {
    const quote = quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens,
      outputTokens,
      usage: { output: 1 },
    })
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBe(amount)
  }
  const missing = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    inputTokens: 32000,
    usage: { output: 1 },
  })
  expect(missing.status).toBe("unavailable")
  expect(missing.requirementDetails?.map((detail) => detail.axis)).toContain(
    "outputTokens",
  )
})
