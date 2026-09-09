import { describe, expect, it } from "vitest"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_RANGE_AXES,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  PRICING_VIDEO_INPUTS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

const plan: PricingPlan = {
  rates: {
    input: {
      amount: 5,
      currency: "USD",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    },
    output: {
      amount: 25,
      currency: "USD",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    },
    request: {
      amount: 0.01,
      currency: "USD",
      unit: PRICE_RATE_UNITS.REQUEST,
      per: 1,
    },
  },
  rules: [],
  source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
  groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
  issues: [],
}

describe("quoteModelPrice", () => {
  it("resolves earlier unknown conditions only for meters overwritten by a later rule", () => {
    const tiered: PricingPlan = {
      ...plan,
      rules: [
        {
          id: "time",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.UTC_WINDOW,
              startMinute: 0,
              endMinute: 720,
            },
          ],
          rates: { input: plan.rates.input, output: plan.rates.output },
        },
        {
          id: "long",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS,
              min: 100,
            },
          ],
          rates: { input: { ...plan.rates.input!, amount: 3 } },
        },
      ],
    }
    const scenario = {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens: 200,
      usage: { input: 1 },
    }
    expect(
      quoteModelPrice(tiered, scenario, { groupMultiplier: 1 }),
    ).toMatchObject({
      status: "complete",
      amount: 3,
      issues: [],
    })
    expect(
      quoteModelPrice(
        tiered,
        { ...scenario, usage: { input: 1, output: 1 } },
        { groupMultiplier: 1 },
      ),
    ).toMatchObject({
      status: "partial",
      issues: expect.arrayContaining([
        { code: "condition-missing", meter: "output" },
      ]),
    })
    expect(
      quoteModelPrice(
        { ...tiered, rules: [...tiered.rules].reverse() },
        scenario,
        { groupMultiplier: 1 },
      ),
    ).toMatchObject({
      issues: expect.arrayContaining([
        { code: "condition-missing", meter: "input" },
      ]),
    })
  })

  it("uses reference length only to select a price tier, even beyond model capacity", () => {
    const tiered: PricingPlan = {
      ...plan,
      limits: { totalTokens: 100 },
      rules: [
        {
          id: "long",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS,
              min: 200,
            },
          ],
          rates: { input: { ...plan.rates.input!, amount: 10 } },
        },
      ],
    }
    const short = quoteModelPrice(
      tiered,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens: 150,
        outputTokens: 10,
        usage: { input: 1, output: 1 },
      },
      { groupMultiplier: 1 },
    )
    const long = quoteModelPrice(
      tiered,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens: 300,
        outputTokens: 10,
        usage: { input: 1, output: 1 },
      },
      { groupMultiplier: 1 },
    )
    expect(short).toMatchObject({ status: "complete", amount: 15 })
    expect(long).toMatchObject({ status: "complete", amount: 17.5 })
  })

  it("does not enforce capacity when fixed-call comparison normalizes to one request", () => {
    const model = {
      model_name: "fixed",
      quota_type: 1,
      model_price: 0.1,
      model_ratio: 0,
      completion_ratio: 0,
      enable_groups: [],
      supported_endpoint_types: [],
      pricingPlan: {
        ...plan,
        usageMode: PRICING_USAGE_MODES.REQUEST,
        rates: {
          request: {
            amount: 0.1,
            currency: "USD" as const,
            unit: PRICE_RATE_UNITS.REQUEST,
            per: 1,
          },
        },
        limits: { totalTokens: 100 },
      },
    }
    const quote = quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        inputTokens: 32000,
        outputTokens: 2000,
        usage: { input: 80, output: 20 },
      },
      { groupMultiplier: 1 },
    )
    expect(quote).toMatchObject({
      status: "complete",
      unit: "request",
      amount: 0.1,
    })
  })
  it.each([
    [
      PRICING_PURPOSES.REQUEST,
      300000,
      { input: 150000, cacheRead: 150000 },
      "complete",
      0.75,
    ],
    [PRICING_PURPOSES.REQUEST, 300000, { input: 150000 }, "unavailable", null],
    [
      PRICING_PURPOSES.TOKEN_INDEX,
      300000,
      { input: 1, cacheRead: 1 },
      "complete",
      2.5,
    ],
    [PRICING_PURPOSES.TOKEN_INDEX, 300000, { input: 1 }, "unavailable", null],
    [
      PRICING_PURPOSES.TOKEN_INDEX,
      undefined,
      { input: 1 },
      "unavailable",
      null,
    ],
  ] as const)(
    "applies input deductions to %s scenarios",
    (purpose, inputTokens, usage, status, amount) => {
      const netInputPlan: PricingPlan = {
        ...plan,
        rates: {},
        requiresRuleMatch: true,
        rules: [
          {
            id: "short",
            conditions: [
              {
                kind: PRICING_CONDITION_KINDS.RANGE,
                axis: PRICING_RANGE_AXES.INPUT_TOKENS,
                maxExclusive: 272001,
                inputTokenDeductions: {
                  openai: [PRICING_METERS.CACHE_READ],
                  anthropic: [PRICING_METERS.CACHE_READ],
                },
              },
            ],
            rates: {
              input: plan.rates.input!,
              cacheRead: {
                amount: 0,
                currency: "USD",
                unit: PRICE_RATE_UNITS.TOKEN,
                per: TOKENS_PER_MILLION,
              },
            },
          },
        ],
      }
      const result = quoteModelPrice(
        netInputPlan,
        { purpose, inputTokens, usage },
        { groupMultiplier: 1 },
      )
      expect(result.status).toBe(status)
      if (amount === null) expect(result.amount).toBeNull()
      else expect(result.amount).toBeCloseTo(amount)
    },
  )

  it("quotes video output independently of text weights and requires the video reference condition", () => {
    const videoPlan: PricingPlan = {
      rates: {},
      rules: [
        {
          id: "reference",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.SELECTION,
              axis: PRICING_SELECTION_AXES.VIDEO_INPUT,
              value: PRICING_VIDEO_INPUTS.WITH_VIDEO,
            },
          ],
          rates: {
            videoOutput: {
              amount: 6,
              currency: "USD",
              unit: PRICE_RATE_UNITS.TOKEN,
              per: TOKENS_PER_MILLION,
            },
          },
        },
      ],
      usageMode: PRICING_USAGE_MODES.VIDEO,
      requiresRuleMatch: true,
      source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
      groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
      issues: [],
    }
    const scenario = {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 80, output: 20, cacheRead: 10 },
    }
    expect(
      quoteModelPrice(videoPlan, scenario, { groupMultiplier: 2 }),
    ).toMatchObject({ status: "unavailable", amount: null })
    expect(
      quoteModelPrice(
        videoPlan,
        { ...scenario, videoInput: PRICING_VIDEO_INPUTS.WITH_VIDEO },
        { groupMultiplier: 2 },
      ),
    ).toMatchObject({
      status: "complete",
      amount: 12,
      unit: "million-video-output-tokens",
      lines: [{ meter: "videoOutput", quantity: 1, amount: 12 }],
    })
  })
  it("reports unresolved tier requirements independently of the provider", () => {
    const tieredPlan: PricingPlan = {
      ...plan,
      rates: {},
      requiresRuleMatch: true,
      rules: [
        {
          id: "input-tier",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS_CACHE_BASIS_UNKNOWN,
              min: 0,
              maxExclusive: 32001,
            },
          ],
          rates: { input: plan.rates.input },
        },
      ],
    }
    const quote = (
      purpose: "request" | "token-index",
      inputTokens?: number,
      cacheRead?: number,
    ) =>
      quoteModelPrice(
        tieredPlan,
        {
          purpose,
          inputTokens,
          usage: { input: 1, cacheRead },
        },
        { groupMultiplier: 1 },
      )
    expect(quote(PRICING_PURPOSES.TOKEN_INDEX, 32000).status).toBe("complete")
    for (const result of [
      quote(PRICING_PURPOSES.TOKEN_INDEX, 32000, 1),
      quote(PRICING_PURPOSES.REQUEST, 32000),
    ]) {
      expect(result.amount).toBeNull()
      expect(result.issues).toContainEqual({
        code: "cache-basis-unknown",
        meter: "input",
      })
      expect(result.issues).not.toContainEqual({
        code: "price-range-unavailable",
      })
    }
    expect(quote(PRICING_PURPOSES.TOKEN_INDEX).issues).toContainEqual({
      code: "condition-missing",
      meter: "input",
    })
    expect(
      quote(PRICING_PURPOSES.TOKEN_INDEX).issues.some(
        (issue) => issue.code === PRICING_ISSUE_CODES.CACHE_BASIS_UNKNOWN,
      ),
    ).toBe(false)
  })

  it("retains the actual conversion and denominator when a selected price is missing", () => {
    const quote = quoteModelPrice(
      { ...plan, rates: { input: plan.rates.input } },
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 4, output: 1 } },
      { groupMultiplier: 0.5, currency: "CNY", cnyPerUsd: 7 },
    )
    expect(quote.calculation).toEqual({
      groupMultiplier: 0.5,
      cnyPerUsd: 7,
      totalWeight: 5,
    })
    expect(quote.lines[0]).toMatchObject({
      quantity: 4,
      effectiveUnitRate: 17.5,
      amount: 14,
    })
    expect(quote.amount).toBe(14)
    expect(quote.status).toBe("partial")
  })
  it("quotes one representative request including its request fee and applies the group rate once", () => {
    expect(
      quoteModelPrice(
        plan,
        {
          purpose: PRICING_PURPOSES.REQUEST,
          inputTokens: 32_000,
          outputTokens: 2_000,
          usage: { input: 32_000, output: 2_000, request: 1 },
        },
        { groupMultiplier: 0.5 },
      ),
    ).toMatchObject({
      status: "complete",
      amount: expect.closeTo(0.11, 10),
      unit: "request",
      currency: "USD",
      lines: [
        { meter: "input", amount: 0.08 },
        { meter: "output", amount: 0.025 },
        { meter: "request", amount: 0.005 },
      ],
    })
  })
})

it("selects whole-request half-open tiers and overlays only the supplied keys in order", () => {
  const conditional: PricingPlan = {
    ...plan,
    rules: [
      {
        id: "long",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.RANGE,
            axis: PRICING_RANGE_AXES.INPUT_TOKENS,
            min: 200001,
          },
        ],
        rates: {
          input: {
            amount: 10,
            currency: "USD",
            unit: PRICE_RATE_UNITS.TOKEN,
            per: TOKENS_PER_MILLION,
          },
          output: {
            amount: 50,
            currency: "USD",
            unit: PRICE_RATE_UNITS.TOKEN,
            per: TOKENS_PER_MILLION,
          },
        },
      },
      {
        id: "discount",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.RANGE,
            axis: PRICING_RANGE_AXES.INPUT_TOKENS,
            min: 200001,
          },
        ],
        rates: {
          input: {
            amount: 8,
            currency: "USD",
            unit: PRICE_RATE_UNITS.TOKEN,
            per: TOKENS_PER_MILLION,
          },
        },
      },
    ],
  }
  const scenario = {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    inputTokens: 200000,
    usage: { input: 1, output: 1 },
  }
  expect(
    quoteModelPrice(conditional, scenario, { groupMultiplier: 1 }).amount,
  ).toBe(15)
  const long = quoteModelPrice(
    conditional,
    { ...scenario, inputTokens: 200001 },
    { groupMultiplier: 1 },
  )
  expect(long.amount).toBe(29)
  expect(long.matchedRules.map((rule) => rule.id)).toEqual(["long", "discount"])
})

it("uses the weekday at the request instant for a midnight-wrapping UTC window", () => {
  const timed: PricingPlan = {
    ...plan,
    rules: [
      {
        id: "night",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.UTC_WINDOW,
            startMinute: 990,
            endMinute: 30,
            days: [1],
          },
        ],
        rates: {
          input: {
            amount: 2,
            currency: "USD",
            unit: PRICE_RATE_UNITS.TOKEN,
            per: TOKENS_PER_MILLION,
          },
        },
      },
    ],
  }
  const scenario = {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    usage: { input: 1 },
  }
  expect(
    quoteModelPrice(
      timed,
      { ...scenario, at: "2026-09-07T00:29:59Z" },
      { groupMultiplier: 1 },
    ).amount,
  ).toBe(2)
  expect(
    quoteModelPrice(
      timed,
      { ...scenario, at: "2026-09-07T00:30:00Z" },
      { groupMultiplier: 1 },
    ).amount,
  ).toBe(5)
  expect(
    quoteModelPrice(
      timed,
      { ...scenario, at: "2026-09-08T00:10:00Z" },
      { groupMultiplier: 1 },
    ).amount,
  ).toBe(5)
  timed.rules[0].conditions = [
    { kind: PRICING_CONDITION_KINDS.UTC_WINDOW, startMinute: 0, endMinute: 0 },
  ]
  expect(
    quoteModelPrice(
      timed,
      { ...scenario, at: "2026-09-08T12:00:00Z" },
      { groupMultiplier: 1 },
    ).amount,
  ).toBe(2)
})

it("keeps valid zero prices, rejects missing positively used prices, and ignores unused prices", () => {
  const zero: PricingPlan = {
    ...plan,
    rates: {
      input: {
        amount: 0,
        currency: "USD",
        unit: PRICE_RATE_UNITS.TOKEN,
        per: TOKENS_PER_MILLION,
      },
    },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
  }
  expect(
    quoteModelPrice(zero, {
      purpose: PRICING_PURPOSES.REQUEST,
      usage: { input: 20, output: 0 },
    }),
  ).toMatchObject({ status: "complete", amount: 0 })
  expect(
    quoteModelPrice(zero, {
      purpose: PRICING_PURPOSES.REQUEST,
      usage: { input: 20, output: 1 },
    }),
  ).toMatchObject({
    status: "partial",
    amount: 0,
    issues: [{ code: "price-missing", meter: "output" }],
  })
  expect(
    quoteModelPrice(
      {
        ...zero,
        issues: [
          {
            code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
            meters: [PRICING_METERS.INPUT],
          },
        ],
      },
      { purpose: PRICING_PURPOSES.REQUEST, usage: { input: 20 } },
    ).status,
  ).toBe("unavailable")
})

it("distinguishes exhausted rule coverage from an unverified axis and never uses the compatibility base", () => {
  const tiered: PricingPlan = {
    ...plan,
    requiresRuleMatch: true,
    rules: [
      {
        id: "finite",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.RANGE,
            axis: PRICING_RANGE_AXES.INPUT_TOKENS,
            min: 0,
            maxExclusive: 272001,
          },
        ],
        rates: plan.rates,
      },
    ],
  }
  const scenario = {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    inputTokens: 272000,
    usage: { input: 1 },
  }
  expect(quoteModelPrice(tiered, scenario, { groupMultiplier: 1 }).amount).toBe(
    5,
  )
  expect(
    quoteModelPrice(
      tiered,
      { ...scenario, inputTokens: 272001 },
      { groupMultiplier: 1 },
    ),
  ).toMatchObject({ status: "unavailable", amount: null })
  tiered.rules[0].conditions = [
    {
      kind: PRICING_CONDITION_KINDS.RANGE,
      axis: PRICING_RANGE_AXES.UNVERIFIED_CONTEXT_TOKENS,
      min: 0,
    },
  ]
  tiered.issues = [{ code: PRICING_ISSUE_CODES.UNVERIFIED_AXIS }]
  expect(
    quoteModelPrice(tiered, scenario, { groupMultiplier: 1 }),
  ).toMatchObject({
    status: "unavailable",
    issues: expect.arrayContaining([{ code: "unverified-axis" }]),
  })
})

it("does not compare incompatible units, missing conversion rates or missing group rates", () => {
  expect(
    quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 1 },
    }).status,
  ).toBe("unavailable")
  expect(
    quoteModelPrice(
      plan,
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1 } },
      { groupMultiplier: 1, currency: "CNY" },
    ).status,
  ).toBe("unavailable")
  const badUnit: PricingPlan = {
    ...plan,
    rates: {
      input: {
        amount: 5,
        currency: "USD",
        unit: PRICE_RATE_UNITS.IMAGE,
        per: 1,
      },
    },
  }
  expect(
    quoteModelPrice(
      badUnit,
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1 } },
      { groupMultiplier: 1 },
    ).status,
  ).toBe("unavailable")
})

it("rejects confirmed model limits independently from pricing coverage", () => {
  const limited = {
    ...plan,
    limits: { inputTokens: 1000, outputTokens: 200, totalTokens: 1100 },
  }
  expect(
    quoteModelPrice(
      limited,
      {
        purpose: PRICING_PURPOSES.REQUEST,
        inputTokens: 1001,
        outputTokens: 10,
        usage: { input: 1001, output: 10, request: 1 },
      },
      { groupMultiplier: 1 },
    ),
  ).toMatchObject({
    status: "unavailable",
    issues: expect.arrayContaining([{ code: "model-limit-exceeded" }]),
  })
  expect(
    quoteModelPrice(
      limited,
      {
        purpose: PRICING_PURPOSES.REQUEST,
        inputTokens: 1000,
        outputTokens: 101,
        usage: { input: 1000, output: 101, request: 1 },
      },
      { groupMultiplier: 1 },
    ).status,
  ).toBe("unavailable")
})

it("evaluates local pricing windows with daylight-saving time and local weekdays", () => {
  const local: PricingPlan = {
    ...plan,
    rules: [
      {
        id: "local",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.TIME_WINDOW,
            timeZone: "America/New_York",
            startMinute: 9 * 60,
            endMinute: 17 * 60,
            days: [1, 2, 3, 4, 5],
          },
        ],
        rates: {
          input: {
            amount: 10,
            currency: "USD",
            unit: PRICE_RATE_UNITS.TOKEN,
            per: TOKENS_PER_MILLION,
          },
        },
      },
    ],
  }
  const quote = (at: string) =>
    quoteModelPrice(
      local,
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, at, usage: { input: 1 } },
      { groupMultiplier: 1 },
    )
  expect(quote("2026-07-06T13:00:00Z").amount).toBe(10)
  expect(quote("2026-01-05T13:00:00Z").amount).toBe(5)
  expect(quote("2026-07-06T21:00:00Z").amount).toBe(5)
  expect(quote("2026-07-05T13:00:00Z").amount).toBe(5)
})

it("applies an absolute promotion only within its inclusive start and exclusive end", () => {
  const dated: PricingPlan = {
    ...plan,
    rules: [
      {
        id: "sale",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.DATE_WINDOW,
            start: "2026-09-01T00:00:00Z",
            end: "2026-09-08T00:00:00Z",
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
  }
  const quote = (at: string) =>
    quoteModelPrice(
      dated,
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, at, usage: { input: 1 } },
      { groupMultiplier: 1 },
    )
  expect(quote("2026-09-01T00:00:00Z").amount).toBe(1)
  expect(quote("2026-09-08T00:00:00Z").amount).toBe(5)
})

it("retains source rates and tiers when a missing multiplier prevents comparison", () => {
  const quoted = quoteModelPrice(
    {
      ...plan,
      rules: [
        {
          id: "long",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS,
              min: 100001,
            },
          ],
          rates: {
            input: {
              amount: 10,
              currency: "USD",
              unit: PRICE_RATE_UNITS.TOKEN,
              per: TOKENS_PER_MILLION,
            },
          },
        },
      ],
    },
    { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1, output: 1 } },
  )
  expect(quoted.amount).toBeNull()
  expect(quoted.issues).toContainEqual({ code: "group-rate-missing" })
  expect(quoted.publishedSchedule).toMatchObject([
    { id: "base", rates: plan.rates },
    { id: "long", rates: { input: { amount: 10 } } },
  ])
})

it("compares one image while retaining actual request quantities and requiring image size", () => {
  const imagePlan: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.IMAGE,
    rates: {},
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
    issues: [],
    requiresRuleMatch: true,
    rules: [
      {
        id: PRICING_IMAGE_SIZES.K2,
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.IMAGE_SIZE,
            value: PRICING_IMAGE_SIZES.K2,
          },
        ],
        rates: {
          image: {
            amount: 0.2,
            currency: "USD",
            unit: PRICE_RATE_UNITS.IMAGE,
            per: 1,
          },
        },
      },
    ],
  }
  expect(
    quoteModelPrice(imagePlan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      imageSize: PRICING_IMAGE_SIZES.K2,
      usage: { input: 80, output: 20 },
    }),
  ).toMatchObject({ status: "complete", unit: "image", amount: 0.2 })
  expect(
    quoteModelPrice(imagePlan, {
      purpose: PRICING_PURPOSES.REQUEST,
      imageSize: PRICING_IMAGE_SIZES.K2,
      usage: { image: 3 },
    }).amount,
  ).toBeCloseTo(0.6)
  expect(
    quoteModelPrice(imagePlan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 80, output: 20 },
    }),
  ).toMatchObject({ status: "unavailable", unit: "image", amount: null })
})

it("does not block selected-token comparison on unmodeled request fees", () => {
  const tokenPlan: PricingPlan = {
    ...plan,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [{ code: PRICING_ISSUE_CODES.UNKNOWN_FEES }],
  }
  expect(
    quoteModelPrice(tokenPlan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 1, output: 1 },
    }),
  ).toMatchObject({ status: "complete", amount: 15, issues: [] })
  expect(
    quoteModelPrice(tokenPlan, {
      purpose: PRICING_PURPOSES.REQUEST,
      usage: { input: 1, output: 1, request: 1 },
    }),
  ).toMatchObject({ status: "partial", issues: [{ code: "unknown-fees" }] })
})
