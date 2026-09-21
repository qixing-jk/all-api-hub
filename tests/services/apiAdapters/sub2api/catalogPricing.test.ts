import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  applySub2ApiPriceEstimates,
  buildSub2ApiRuntimePricingResponse,
} from "~/services/apiAdapters/sub2api/catalogPricing"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import {
  PRICING_IMAGE_SIZES,
  PRICING_PURPOSES,
} from "~/services/modelPricing/pricingConstants"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const priceTable = {
  source: "synthetic-test",
  source_date: "2026-06-14",
  models: {
    "example-priced-model": {
      input: 2,
      output: 6,
    },
    "example-cache-model": {
      input: 1,
      output: 3,
      cache_read: 0.25,
      cache_write: 0.5,
    },
    "example-input-only-model": {
      input: 2,
    },
    "example-output-only-model": {
      output: 6,
    },
    "example-unpriced-model": {},
  },
}

describe("buildSub2ApiRuntimePricingResponse", () => {
  it("builds Sub2API runtime-key source metadata without pricing", () => {
    const result = buildSub2ApiRuntimePricingResponse([{ id: "runtime-model" }])

    expect(result.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "runtime-model",
        price_metadata: expect.objectContaining({
          unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        }),
      }),
    ])
  })
})

describe("applySub2ApiPriceEstimates", () => {
  it("preserves a browsable price-table source through a flat estimate quote", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1 },
      groupRates: {},
      priceTable: {
        ...priceTable,
        source:
          "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json",
      },
    })
    const quote = quoteCanonicalModelPrice(
      atIndex(result.data, 0),
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1 } },
      {},
    )
    expect(quote.source).toMatchObject({
      kind: "estimate",
      url: "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json",
    })
  })
  it("uses user-specific group rates before the default group rate", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: { "9": 2 },
      priceTable,
    })

    expect(result.data[0]).toMatchObject({
      model_name: "example-priced-model",
      token_price_usd_per_million: {
        input: 4,
        output: 12,
      },
      price_metadata: {
        source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
        precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
        source_date: "2026-06-14",
      },
    })
    expect(result.groupRatios).toEqual({ vip: 2 })
    expect(result.model_list_source?.supportsPricing).toBe(true)
  })

  it("normalizes invalid and zero group rates before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }, { id: "example-cache-model" }],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: { "9": "invalid", "10": 0 } as any,
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
    expect(result.data[1]?.token_price_usd_per_million).toEqual({
      input: 1,
      output: 3,
      cache_read: 0.25,
      cache_write: 0.5,
    })
  })

  it("normalizes negative user-specific group rates before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: { "9": -2 },
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
  })

  it("normalizes zero group rate multipliers before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 0 },
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
  })

  it("normalizes negative group rate multipliers before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: { groupId: "9", groupName: "vip", rate_multiplier: -1.5 },
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
  })

  it("normalizes invalid group rate multipliers before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: {
        groupId: "9",
        groupName: "vip",
        rate_multiplier: "invalid" as any,
      },
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
  })

  it("keeps unmatched official prices visible as unavailable model rows", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-unpriced-model" }, { id: "missing-from-table" }],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: {},
      priceTable,
    })

    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "example-unpriced-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
      expect.objectContaining({
        model_name: "missing-from-table",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
    ])
  })

  it("treats partial official token price rows as unavailable", () => {
    const result = applySub2ApiPriceEstimates({
      models: [
        { id: "example-input-only-model" },
        { id: "example-output-only-model" },
      ],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: {},
      priceTable,
    })

    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "example-input-only-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
      expect.objectContaining({
        model_name: "example-output-only-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
    ])
    expect(result.data[0]?.token_price_usd_per_million).toBeUndefined()
    expect(result.data[1]?.token_price_usd_per_million).toBeUndefined()
  })

  it("applies cache read and cache write estimates when official prices include them", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-cache-model" }],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 1.5,
      output: 4.5,
      cache_read: 0.375,
      cache_write: 0.75,
    })
  })

  it("disables estimation when the selected key group is unknown", () => {
    const result = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: null,
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]).toMatchObject({
      model_name: "example-priced-model",
      price_metadata: {
        source: MODEL_PRICE_SOURCE_KINDS.NONE,
        precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN,
      },
    })
    expect(result.model_list_source?.supportsPricing).toBe(false)
  })
})

it.each([
  ["bad", "17:00"],
  ["24:00", "17:00"],
  ["09:60", "17:00"],
  ["09:00", "24:01"],
  ["09:00", "bad"],
])(
  "preserves valid station rules beside malformed period %s-%s without exposing an exact price",
  (start_time, end_time) => {
    const response = applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: { groupId: "9", groupName: "vip" },
      groupRates: { "9": 1 },
      priceTable,
      pricingCatalogs: {
        plaza: {
          groups: [
            {
              id: 9,
              models: [
                {
                  name: "example-priced-model",
                  pricing: {
                    billing_mode: "token",
                    input_price: 0.000003,
                    output_price: 0.000015,
                  },
                  time_pricing: {
                    timezone: "UTC",
                    periods: [
                      { start_time, end_time, multiplier: 0.5 },
                      {
                        start_time: "17:00",
                        end_time: "24:00",
                        multiplier: 0.8,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    })
    const model = atIndex(response.data, 0)
    expect(model.pricingPlan?.rates.input?.amount).toBe(0.000003)
    expect(model.pricingPlan?.rules).toHaveLength(1)
    expect(atIndex(model.pricingPlan?.rules, 0).conditions).toContainEqual({
      kind: "time-window",
      timeZone: "UTC",
      startMinute: 1020,
      endMinute: 1440,
    })
    expect(model.price_metadata).toMatchObject({
      precision: "unavailable",
      unavailable_reason: "pricing-source-unavailable",
    })
    expect(
      quoteCanonicalModelPrice(
        model,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          at: "2026-09-09T18:00:00Z",
          usage: { input: 1 },
        },
        { groupMultiplier: 1 },
      ).amount,
    ).toBeNull()
  },
)

it("prefers the selected runtime group's station schedule over LiteLLM and applies local time and user rates once", () => {
  const response = applySub2ApiPriceEstimates({
    models: [{ id: "example-priced-model" }],
    group: { groupId: "9", groupName: "vip", rate_multiplier: 2 },
    groupRates: { "9": 0.5 },
    priceTable,
    pricingCatalogs: {
      plaza: {
        groups: [
          {
            id: 9,
            name: "vip",
            rate_multiplier: 2,
            long_context_pricing_enabled: true,
            models: [
              {
                name: "example-priced-model",
                long_context_basis: "whole_request",
                pricing: {
                  billing_mode: "token",
                  input_price: 0.000003,
                  output_price: 0.000015,
                  intervals: [
                    {
                      min_tokens: 200000,
                      max_tokens: null,
                      input_price: 0.000006,
                      output_price: 0.0000225,
                    },
                  ],
                },
                time_pricing: {
                  timezone: "Asia/Shanghai",
                  weekdays_only: true,
                  periods: [
                    { start_time: "09:00", end_time: "17:00", multiplier: 0.5 },
                  ],
                },
              },
            ],
          },
          {
            id: 10,
            name: "other",
            models: [
              {
                name: "example-priced-model",
                pricing: {
                  billing_mode: "token",
                  input_price: 0,
                  output_price: 0,
                },
              },
            ],
          },
        ],
      },
    },
  })
  const quote = (at: string) =>
    quoteCanonicalModelPrice(
      atIndex(response.data, 0),
      {
        purpose: PRICING_PURPOSES.REQUEST,
        inputTokens: 300000,
        outputTokens: 10000,
        at,
        usage: { input: 300000, output: 10000, request: 1 },
      },
      { groupMultiplier: 0.5 },
    )
  expect(quote("2026-09-08T01:00:00Z")).toMatchObject({
    status: "complete",
    amount: 0.50625,
    source: { kind: "account" },
  })
  expect(quote("2026-09-08T09:00:00Z").amount).toBe(1.0125)
  expect(atIndex(response.data, 0).enable_groups).toEqual(["vip"])
})

it("preserves station interval gaps, inclusive upper bounds and explicit-price precedence", () => {
  const response = applySub2ApiPriceEstimates({
    models: [{ id: "example-priced-model" }],
    group: { groupId: "9", groupName: "vip" },
    groupRates: { "9": 1 },
    priceTable,
    pricingCatalogs: {
      plaza: {
        groups: [
          {
            id: 9,
            models: [
              {
                name: "example-priced-model",
                long_context_basis: "whole_request",
                pricing: {
                  billing_mode: "token",
                  input_price: 0.000002,
                  output_price: 0.000006,
                  intervals: [
                    {
                      min_tokens: 100,
                      max_tokens: 200,
                      input_price: 0.000005,
                      input_multiplier: 99,
                      output_multiplier: 2,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  })
  const quote = (inputTokens: number) =>
    quoteCanonicalModelPrice(
      atIndex(response.data, 0),
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens,
        usage: { input: 1, output: 1 },
      },
      { groupMultiplier: 1 },
    )
  expect(quote(100).amount).toBe(4)
  expect(quote(101).amount).toBe(8.5)
  expect(quote(200).amount).toBe(8.5)
  expect(quote(201).amount).toBe(4)
})

it("keeps unresolved channel policy and ambiguous station rows out of estimated fallback", () => {
  const item = {
    name: "example-priced-model",
    pricing: {
      billing_mode: "token",
      input_price: 0.000001,
      output_price: 0.000002,
    },
  }
  const params = {
    models: [{ id: "example-priced-model" }],
    group: { groupId: "9", groupName: "vip" },
    groupRates: { "9": 1 },
    priceTable,
  }
  for (const pricingCatalogs of [
    {
      channels: [
        {
          name: "channel",
          platforms: [{ groups: [{ id: 9 }], supported_models: [item] }],
        },
      ],
    },
    { plaza: { groups: [{ id: 9, models: [item, item] }] } },
    {
      plaza: {
        groups: [
          { id: 9, models: [item] },
          { id: 9, models: [item] },
        ],
      },
    },
    {
      plaza: {
        groups: [
          {
            id: 9,
            subscription_type: "subscription",
            peak_rate_enabled: true,
            models: [item],
          },
        ],
      },
    },
  ]) {
    const model = atIndex(
      applySub2ApiPriceEstimates({ ...params, pricingCatalogs }).data,
      0,
    )
    expect(model.price_metadata).toMatchObject({
      precision: "unavailable",
      unavailable_reason: "pricing-source-unavailable",
    })
    expect(
      quoteCanonicalModelPrice(
        model,
        { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1 } },
        { groupMultiplier: 1 },
      ),
    ).toMatchObject({
      status: "unavailable",
      amount: null,
      source: { kind: "account" },
    })
  }
})

it.each([
  {
    billing_mode: "token",
    input_price: 0.000001,
    intervals: [{ min_tokens: 20, max_tokens: 10 }],
  },
  {
    billing_mode: "token",
    input_price: 0.000001,
    intervals: [
      { min_tokens: 0, max_tokens: 100 },
      { min_tokens: 50, max_tokens: 200 },
    ],
  },
  {
    billing_mode: "image",
    intervals: [
      { min_tokens: 0, tier_label: "unsupported", per_request_price: 0.1 },
    ],
  },
  {
    billing_mode: "image",
    intervals: [
      { min_tokens: 0, tier_label: "1k", per_request_price: 0.1 },
      { min_tokens: 0, tier_label: "1k", per_request_price: 0.2 },
    ],
  },
  { billing_mode: "per_request" },
])(
  "keeps malformed station schedules unavailable without estimated fallback %j",
  (pricing) => {
    const model = atIndex(
      applySub2ApiPriceEstimates({
        models: [{ id: "example-priced-model" }],
        group: { groupId: "9", groupName: "vip" },
        groupRates: { "9": 1 },
        priceTable,
        pricingCatalogs: {
          plaza: {
            groups: [
              {
                id: 9,
                models: [
                  {
                    name: "example-priced-model",
                    long_context_basis: "whole_request",
                    pricing,
                  },
                ],
              },
            ],
          },
        },
      }).data,
      0,
    )
    expect(model.price_metadata).toMatchObject({ precision: "unavailable" })
    expect(
      quoteCanonicalModelPrice(
        model,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: { input: 1 },
          imageSize: "1k",
        },
        { groupMultiplier: 1 },
      ),
    ).toMatchObject({ status: "unavailable", amount: null })
  },
)

it("quotes per-request station prices with the selected group and time discount once", () => {
  const response = applySub2ApiPriceEstimates({
    models: [{ id: "example-priced-model" }],
    group: { groupId: "9", groupName: "vip" },
    groupRates: { "9": 0.5 },
    priceTable,
    pricingCatalogs: {
      plaza: {
        groups: [
          {
            id: 9,
            models: [
              {
                name: "example-priced-model",
                pricing: {
                  billing_mode: "per_request",
                  per_request_price: 0.02,
                },
                time_pricing: {
                  timezone: "UTC",
                  periods: [
                    { start_time: "10:00", end_time: "12:00", multiplier: 0.5 },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  })
  expect(calculateModelPrice(atIndex(response.data, 0), 0.5)).toEqual({
    kind: "per-call",
    usdPerCall: 0.01,
  })
  expect(
    quoteCanonicalModelPrice(
      atIndex(response.data, 0),
      {
        purpose: PRICING_PURPOSES.REQUEST,
        at: "2026-09-08T10:00:00Z",
        usage: { input: 32000, output: 2000, request: 1 },
      },
      { groupMultiplier: 0.5 },
    ),
  ).toMatchObject({ status: "complete", amount: 0.005 })
})

it("selects station image size prices and replaces the user rate with the independent image rate", () => {
  const model = atIndex(
    applySub2ApiPriceEstimates({
      models: [{ id: "example-priced-model" }],
      group: { groupId: "9", groupName: "vip" },
      groupRates: { "9": 0.5 },
      priceTable,
      pricingCatalogs: {
        plaza: {
          groups: [
            {
              id: 9,
              image_rate_independent: true,
              image_rate_multiplier: 0.8,
              models: [
                {
                  name: "example-priced-model",
                  pricing: {
                    billing_mode: "image",
                    intervals: [
                      {
                        tier_label: "1K",
                        min_tokens: 0,
                        per_request_price: 0.1,
                      },
                      {
                        tier_label: "2K",
                        min_tokens: 0,
                        per_request_price: 0.2,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    }).data,
    0,
  )
  expect(
    quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.REQUEST,
        imageSize: PRICING_IMAGE_SIZES.K2,
        usage: { input: 32000, output: 2000, request: 1, image: 2 },
      },
      { groupMultiplier: 0.5 },
    ).amount,
  ).toBeCloseTo(0.32)
  expect(
    quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.REQUEST,
        imageSize: PRICING_IMAGE_SIZES.K4,
        usage: { image: 1 },
      },
      { groupMultiplier: 0.5 },
    ).status,
  ).toBe("unavailable")
})
