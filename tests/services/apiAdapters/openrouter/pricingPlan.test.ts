import { expect, it } from "vitest"

import { normalizeOpenRouterPricingPlan } from "~/services/apiAdapters/openrouter/pricingPlan"
import {
  PRICING_METERS,
  PRICING_PURPOSES,
} from "~/services/modelPricing/pricingConstants"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

it.each([
  ["0.00000075", "0.00000375"],
  ["0.000000375", "0.000001875"],
])(
  "quotes published text and reasoning at one output rate: %s / %s",
  (prompt, completion) => {
    const plan = normalizeOpenRouterPricingPlan({
      prompt,
      completion,
      internal_reasoning: completion,
      image: prompt,
      audio: prompt,
      input_audio_cache: String(Number(prompt) / 10),
      input_cache_read: String(Number(prompt) / 10),
      input_cache_write: "0.0000000416666666666667",
      web_search: "0.014",
    })
    const quote = quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 80, output: 20 },
    })
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBeCloseTo(
      (Number(prompt) * 0.8 + Number(completion) * 0.2) * 1_000_000,
    )
    expect(
      quote.lines.find((line) => line.meter === PRICING_METERS.OUTPUT)?.rate
        .amount,
    ).toBe(Number(completion))
  },
)

it.each([
  { internal_reasoning: "invalid" },
  { internal_reasoning: true },
  { completion: undefined },
])(
  "does not assume a reasoning mix for different or unverified rates: %j",
  (extension) => {
    const plan = normalizeOpenRouterPricingPlan({
      prompt: "0.00000075",
      completion: "0.00000375",
      internal_reasoning: "0.00000375",
      ...extension,
    })
    const quote = quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens: 200,
      usage: { input: 80, output: 20 },
    })
    expect(quote.status).toBe("partial")
    expect(quote.issues).toContainEqual({
      code: "price-missing",
      meter: "output",
    })
  },
)

it("preserves input-only overrides when the output rate remains uniform", () => {
  const plan = normalizeOpenRouterPricingPlan({
    prompt: "0.000001",
    completion: "0.000002",
    internal_reasoning: "0.000002",
    overrides: [{ min_prompt_tokens: 100, prompt: "0.000003" }],
  })
  const quote = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    inputTokens: 200,
    usage: { input: 1, output: 1 },
  })
  expect(quote.status).toBe("complete")
  expect(quote.amount).toBeCloseTo(2.5)
})

it.each([1, 0.5])(
  "keeps the default Gemini tier comparable at scale %s",
  (scale) => {
    const plan = normalizeOpenRouterPricingPlan({
      prompt: 0.000002 * scale,
      completion: 0.000012 * scale,
      internal_reasoning: 0.000012 * scale,
      overrides: [
        {
          min_prompt_tokens: 200000,
          prompt: 0.000004 * scale,
          completion: 0.000018 * scale,
        },
      ],
    })
    for (const inputTokens of [32000, 200000]) {
      const quote = quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens,
        usage: { input: 80, output: 20 },
      })
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(4 * scale)
    }
    const long = quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens: 200001,
      usage: { input: 80, output: 20 },
    })
    expect(long.status).toBe("partial")
    expect(long.issues).toContainEqual({
      code: "output-token-mix",
      meter: "output",
    })
    expect(
      long.lines.some((line) => line.meter === PRICING_METERS.OUTPUT),
    ).toBe(false)
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens: 200001,
        usage: { input: 1 },
      }).status,
    ).toBe("complete")
  },
)

it("explains negative catalog placeholders without turning them into free prices", () => {
  const plan = normalizeOpenRouterPricingPlan({
    prompt: "-1",
    completion: "-1",
  })
  const quote = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    usage: { input: 80, output: 20 },
  })
  expect(quote.status).toBe("unavailable")
  expect(quote.amount).toBeNull()
  expect(quote.issues).toContainEqual({ code: "price-unavailable" })
  expect(quote.issues).not.toContainEqual({ code: "unsupported-rule" })
})

it("restores a uniform output price when a later matching override replaces it", () => {
  const plan = normalizeOpenRouterPricingPlan({
    prompt: "0.000001",
    completion: "0.000002",
    internal_reasoning: "0.000002",
    overrides: [
      { min_prompt_tokens: 100, completion: "0.000003" },
      { min_prompt_tokens: 200, completion: "0.000002" },
    ],
  })
  const quote = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    inputTokens: 201,
    usage: { output: 1 },
  })
  expect(quote.status).toBe("complete")
  expect(quote.amount).toBe(2)
  const unknownTier = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    usage: { output: 1 },
  })
  expect(unknownTier.status).toBe("unavailable")
})

it("does not fall back to a base price when an override contains a placeholder", () => {
  const plan = normalizeOpenRouterPricingPlan({
    prompt: "0.000001",
    completion: "0.000002",
    overrides: [{ min_prompt_tokens: 100, completion: "-1" }],
  })
  const quote = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    inputTokens: 101,
    usage: { output: 1 },
  })
  expect(quote.status).toBe("unavailable")
  expect(quote.amount).toBeNull()
})
