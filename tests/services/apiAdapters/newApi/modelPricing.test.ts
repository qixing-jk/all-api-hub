import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/modelPricing"
import {
  PRICE_RATE_UNITS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_REASONS,
  PRICING_PURPOSES,
  PRICING_RESPONSE_FORMATS,
  PRICING_SERVICE_TIERS,
  PRICING_VIDEO_INPUTS,
} from "~/services/modelPricing/pricingConstants"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { AuthTypeEnum } from "~/types"

const { fetchModelPricingMock } = vi.hoisted(() => ({
  fetchModelPricingMock: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/modelPricing", () => ({
  defaultModelPricingImplementation: {
    fetchModelPricing: fetchModelPricingMock,
  },
}))

vi.mock("~/services/apiService/newApiFamily/variants/oneHub", () => ({
  fetchModelPricing: vi.fn(),
}))

const request = {
  baseUrl: "https://pricing.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
}

const modelRow = {
  model_name: "example-model",
  quota_type: 0,
  model_ratio: 1,
  model_price: 0,
  completion_ratio: 1,
  enable_groups: [],
  supported_endpoint_types: [],
}

const canonicalModelRow = { ...modelRow, pricingPlan: expect.any(Object) }

const pricingResponse = (extensions: Record<string, unknown> = {}) => ({
  data: [modelRow],
  group_ratio: {},
  success: true,
  usable_group: {},
  ...extensions,
})

describe("New API model pricing adapter", () => {
  it.each([
    ["2026-09-09T00:59:59Z", 3],
    ["2026-09-09T01:00:00Z", 6],
    ["2026-09-09T04:00:00Z", 3],
    ["2026-09-09T06:00:00Z", 6],
    ["2026-09-09T10:00:00Z", 3],
    [undefined, null],
  ])(
    "uses the declared timezone for daily branches at %s",
    async (at, amount) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr:
                '((hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12) || (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18)) ? tier("peak", p * 3 + c * 9 + cr * 0.1) : tier("off", p * 1.5 + c * 4.5 + cr * 0.05)',
            },
          ],
        }),
      )
      const response = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      const quote = quoteCanonicalModelPrice(
        response.data[0],
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          at: at as string | undefined,
          usage: { input: 1, output: 1 },
        },
        { groupMultiplier: 1 },
      )
      expect(quote).toMatchObject({
        status: amount === null ? "unavailable" : "complete",
        amount,
      })
    },
  )
  it.each(["wrong-price", "duplicate-size", "trailing-fee"])(
    "rejects inconsistent image settlement: %s",
    async (problem) => {
      const items = [
        {
          key: "1",
          amount: 0.1,
          unit: PRICE_RATE_UNITS.IMAGE,
          resolution: PRICING_IMAGE_SIZES.K1,
        },
        {
          key: "2",
          amount: 0.2,
          unit: PRICE_RATE_UNITS.IMAGE,
          resolution: PRICING_IMAGE_SIZES.K2,
        },
        {
          key: "4",
          amount: 0.3,
          unit: PRICE_RATE_UNITS.IMAGE,
          resolution: PRICING_IMAGE_SIZES.K4,
        },
      ]
      if (problem === "wrong-price") items[0].amount = 0.11
      if (problem === "duplicate-size")
        items[1].resolution = PRICING_IMAGE_SIZES.K1
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr:
                'v2:tier("base", unit(outputs, resolution == "1k" ? 0.1 : resolution == "2k" ? 0.2 : 0.3))' +
                (problem === "trailing-fee" ? " + 1" : ""),
              price_presentation: {
                kind: "image",
                settlement: "actual_result",
                items,
              },
            },
          ],
        }),
      )
      const response = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      expect(
        quoteCanonicalModelPrice(
          response.data[0],
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            imageSize: PRICING_IMAGE_SIZES.K1,
            usage: { input: 1 },
          },
          { groupMultiplier: 1 },
        ),
      ).toMatchObject({ status: "unavailable", amount: null, unit: "image" })
    },
  )
  it.each([
    [PRICING_IMAGE_SIZES.K1, 0.1],
    [PRICING_IMAGE_SIZES.K2, 0.119999999],
    [PRICING_IMAGE_SIZES.K4, 0.15],
  ] as const)(
    "quotes structured image settlement at %s per image",
    async (imageSize, amount) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr:
                'v2:tier("base", unit(outputs, resolution == "1k" ? 0.0136986301 : resolution == "2k" ? 0.0164383562 : 0.0205479452))',
              price_presentation: {
                kind: "image",
                settlement: "actual_result",
                items: [
                  {
                    key: "1",
                    amount: 0.013698630100000001,
                    unit: PRICE_RATE_UNITS.IMAGE,
                    resolution: PRICING_IMAGE_SIZES.K1,
                  },
                  {
                    key: "2",
                    amount: 0.0164383562,
                    unit: PRICE_RATE_UNITS.IMAGE,
                    resolution: PRICING_IMAGE_SIZES.K2,
                  },
                  {
                    key: "4",
                    amount: 0.0205479452,
                    unit: PRICE_RATE_UNITS.IMAGE,
                    resolution: PRICING_IMAGE_SIZES.K4,
                  },
                ],
              },
            },
          ],
        }),
      )
      const response = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      const quote = quoteCanonicalModelPrice(
        response.data[0],
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          imageSize,
          usage: { input: 80, output: 20 },
        },
        { groupMultiplier: 7.3 },
      )
      expect(quote).toMatchObject({ status: "complete", unit: "image" })
      expect(quote.amount).toBeCloseTo(amount, 8)
    },
  )
  it.each([
    ["2026-09-09T01:00:00Z", 6],
    ["2026-09-09T04:00:00Z", 3],
    ["2026-09-09T06:00:00Z", 6],
    ["2026-09-09T10:00:00Z", 3],
    ["2026-09-12T01:00:00Z", 3],
  ])("selects weekday time tiers at %s", async (at, amount) => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...modelRow,
            billing_mode: "tiered_expr",
            billing_expr:
              'weekday("UTC") >= 1 && weekday("UTC") <= 5 && ((hour("UTC") >= 1 && hour("UTC") < 4) || (hour("UTC") >= 6 && hour("UTC") < 10)) ? tier("peak", p * 3 + c * 9 + cr * 0.1) : tier("off", p * 1.5 + c * 4.5 + cr * 0.05)',
          },
        ],
      }),
    )
    const response = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)
    expect(
      quoteCanonicalModelPrice(
        response.data[0],
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          at,
          usage: { input: 1, output: 1 },
        },
        { groupMultiplier: 1 },
      ),
    ).toMatchObject({ status: "complete", amount })
  })
  it("includes the fixed component of a mixed formula once per request", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...modelRow,
            billing_mode: "tiered_expr",
            billing_expr: "p * 0.03 + c * 0.15 + 1",
          },
        ],
      }),
    )
    const response = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)
    const quote = quoteCanonicalModelPrice(
      response.data[0],
      {
        purpose: PRICING_PURPOSES.REQUEST,
        responseFormat: PRICING_RESPONSE_FORMATS.OPENAI,
        usage: {
          input: 1000000,
          output: 1000000,
          request: 1,
          cacheRead: 0,
          cacheWrite: 0,
          cacheWrite1h: 0,
          imageInput: 0,
          imageOutput: 0,
          audioInput: 0,
          audioOutput: 0,
        },
      },
      { groupMultiplier: 2 },
    )
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBeCloseTo(0.360002, 9)
  })
  it.each([0.1, 0.02])(
    "quotes constant-only v1 expressions per request with the version's unit conversion: %s",
    async (constant) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr: `tier("base", p * 0 + c * 0 + ${constant})`,
            },
          ],
        }),
      )
      const response = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      expect(response.data[0].quota_type).toBe(1)
      const quote = quoteCanonicalModelPrice(
        response.data[0],
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: { input: 1, output: 1 },
        },
        { groupMultiplier: 1 },
      )
      expect(quote).toMatchObject({ status: "complete", unit: "request" })
      expect(quote.amount).toBeCloseTo(
        constant === 0.1 ? 0.0000001 : 0.00000002,
        12,
      )
    },
  )
  it.each([
    "p * 0.03 + c * 0.15",
    "v1:p * 0.03 + c * 0.15",
    "(p * 0.03 + c * 0.15)",
  ])("quotes unwrapped linear token pricing %s", async (billing_expr) => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...modelRow,
            model_ratio: 37.5,
            billing_mode: "tiered_expr",
            billing_expr,
          },
        ],
      }),
    )
    const response = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)
    const quote = quoteCanonicalModelPrice(
      response.data[0],
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1, output: 1 } },
      { groupMultiplier: 1 },
    )
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBeCloseTo(0.09)
  })
  it.each([
    [
      'c == 100 ? tier("a", c * 2) : tier("b", c * 3)',
      PRICING_ISSUE_REASONS.CONDITION_SYNTAX,
      null,
    ],
    [
      'tier("base", max(c * 2, 10))',
      PRICING_ISSUE_REASONS.PRICE_EXPRESSION,
      null,
    ],
    [
      '(tier("base", c * 2)) * (header("x") == "y" ? 2 : 1)',
      PRICING_ISSUE_REASONS.REQUEST_CONDITION,
      null,
    ],
    ['v9:tier("base", c * 2)', PRICING_ISSUE_REASONS.EXPRESSION_VERSION, null],
    ['tier("base", u("seconds") * 2)', PRICING_ISSUE_REASONS.TASK_USAGE, {}],
  ])(
    "reports the unsupported capability for %s",
    async (billing_expr, reason, billing_usage_schema) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr,
              billing_usage_schema,
            },
          ],
        }),
      )
      const response = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      expect(response.data[0].pricingPlan?.issues).toEqual([
        { code: "unsupported-rule", reason },
      ])
      expect(
        quoteCanonicalModelPrice(
          response.data[0],
          { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { output: 1 } },
          { groupMultiplier: 1 },
        ).status,
      ).toBe("unavailable")
    },
  )
  it.each([
    [PRICING_RESPONSE_FORMATS.OPENAI, 10000, 6],
    [PRICING_RESPONSE_FORMATS.ANTHROPIC, 10000, 22],
  ] as const)(
    "normalizes output tier quantities for %s usage",
    async (responseFormat, outputTokens, amount) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr:
                'c <= 5000 ? tier("short", c * 2 + ao * 10) : tier("long", c * 12 + ao * 20)',
            },
          ],
        }),
      )
      const response = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      expect(
        quoteCanonicalModelPrice(
          response.data[0],
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            outputTokens,
            responseFormat,
            usage: { output: 1, audioOutput: 1 },
          },
          { groupMultiplier: 1 },
        ),
      ).toMatchObject({ status: "complete", amount })
    },
  )
  it.each([
    [
      'len <= 200000 ? tier("low", p * 3) : len <= 100000 ? tier("unreachable", p * 9) : tier("high", p * 6)',
      250000,
      6,
    ],
    [
      'p <= 200000 ? tier("low", p * 3) : len <= 300000 ? tier("mid", p * 4) : tier("high", p * 6)',
      250000,
      4,
    ],
    ['len < 2e5 ? tier("low", p * 3) : tier("high", p * 6)', 200000, 6],
  ])(
    "quotes ordered threshold chains %s",
    async (billing_expr, inputTokens, amount) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [{ ...modelRow, billing_mode: "tiered_expr", billing_expr }],
        }),
      )
      const response = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      expect(
        quoteCanonicalModelPrice(
          response.data[0],
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            inputTokens: Number(inputTokens),
            usage: { input: 1 },
          },
          { groupMultiplier: 1 },
        ),
      ).toMatchObject({ status: "complete", amount })
    },
  )
  it.each([
    [32001, 8001, 7],
    [32000, 8001, 5],
    [32001, 8000, 5],
    [1000, 2000, 2],
  ])(
    "honors ordered mixed input/output tier conditions at %s/%s",
    async (inputTokens, outputTokens, amount) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr:
                'len > 32000 && c >= 8001 ? tier("both", p * 7 + c * 7) : c > 2000 ? tier("output", p * 5 + c * 5) : tier("base", p * 2 + c * 2)',
            },
          ],
        }),
      )
      const response = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      expect(
        quoteCanonicalModelPrice(
          response.data[0],
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            inputTokens,
            outputTokens,
            usage: { input: 1, output: 1 },
          },
          { groupMultiplier: 1 },
        ),
      ).toMatchObject({ status: "complete", amount })
    },
  )
  it.each([
    [PRICING_RESPONSE_FORMATS.OPENAI, "complete", 1.12],
    [PRICING_RESPONSE_FORMATS.ANTHROPIC, "complete", 0.2933333333],
    [undefined, "unavailable", null],
  ] as const)(
    "honors %s usage semantics when the input predicate includes unpriced cache",
    async (responseFormat, status, amount) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr:
                'p <= 272000 ? tier("standard", p * 10 + c * 50 + cr * 1) : tier("long", p * 20 + c * 75 + cr * 2)',
            },
          ],
        }),
      )
      const result = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      const quote = quoteCanonicalModelPrice(
        result.data[0],
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          inputTokens: 600000,
          responseFormat,
          usage: { input: 1, cacheRead: 1, cacheWrite: 1 },
        },
        { groupMultiplier: 0.08 },
      )
      expect(quote.status).toBe(status)
      if (amount === null) expect(quote.amount).toBeNull()
      else expect(quote.amount).toBeCloseTo(amount)
    },
  )

  it.each([
    [272000, 1, 0, 0.8],
    [272001, 1, 0, 1.6],
    [300000, 1, 1, 0.44],
  ])(
    "quotes net-input tiers at %s input tokens with mix %s/%s",
    async (inputTokens, input, cacheRead, amount) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr:
                'p <= 272000 ? tier("standard", p * 10 + c * 50 + cr * 1 + cc * 12.5) : tier("long_context", p * 20 + c * 75 + cr * 2 + cc * 25)',
            },
          ],
        }),
      )
      const result = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      expect(
        quoteCanonicalModelPrice(
          result.data[0],
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            inputTokens,
            usage: { input, cacheRead },
          },
          { groupMultiplier: 0.08 },
        ),
      ).toMatchObject({ status: "complete", amount })
    },
  )

  it.each([
    'v2:tier("base", c * (video_input ? 4 : 9))',
    'v2:tier("base", c * (video_input ? 5 : 9)) + 1',
  ])(
    "keeps unmatched video settlement rules unpriced: %s",
    async (billing_expr) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr,
              price_presentation: {
                kind: "video",
                settlement: "actual_result",
                items: [
                  {
                    key: "no-video",
                    amount: 9,
                    unit: "million_output_tokens",
                    video_input: false,
                  },
                  {
                    key: "video",
                    amount: 5,
                    unit: "million_output_tokens",
                    video_input: true,
                  },
                ],
              },
            },
          ],
        }),
      )
      const result = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      expect(
        quoteCanonicalModelPrice(
          result.data[0],
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            videoInput: PRICING_VIDEO_INPUTS.WITH_VIDEO,
            usage: { input: 1 },
          },
          { groupMultiplier: 1 },
        ),
      ).toMatchObject({
        status: "unavailable",
        amount: null,
        unit: "million-video-output-tokens",
        source: { rulesUnavailable: true },
      })
    },
  )

  it.each([false, true])(
    "quotes published video output tiers with video reference %s",
    async (videoInput) => {
      fetchModelPricingMock.mockResolvedValueOnce(
        pricingResponse({
          data: [
            {
              ...modelRow,
              billing_mode: "tiered_expr",
              billing_expr:
                'v2:tier("base", c * (video_input ? 5.7534246575 : 9.5890410959))',
              price_presentation: {
                kind: "video",
                settlement: "actual_result",
                items: [
                  {
                    key: "no-video",
                    amount: 9.5890410959,
                    unit: "million_output_tokens",
                    video_input: false,
                  },
                  {
                    key: "video",
                    amount: 5.7534246575,
                    unit: "million_output_tokens",
                    video_input: true,
                  },
                ],
              },
            },
          ],
        }),
      )
      const result = await createNewApiModelPricing(
        SITE_TYPES.NEW_API,
      ).fetchPricing(request)
      const quote = quoteCanonicalModelPrice(
        result.data[0],
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          videoInput: videoInput
            ? PRICING_VIDEO_INPUTS.WITH_VIDEO
            : PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
          usage: { input: 80, output: 20 },
        },
        { groupMultiplier: 7.3 },
      )
      expect(quote).toMatchObject({
        status: "complete",
        unit: "million-video-output-tokens",
        amount: expect.closeTo(videoInput ? 42 : 70, 6),
      })
    },
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("joins a valid deployment vendor registry without leaking native fields", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...modelRow, vendor_id: 1 }],
        vendors: [
          {
            id: 1,
            name: " Example Publisher ",
            description: "Deployment-defined category",
            icon: "https://assets.example.invalid/vendor.svg",
          },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual({
      ...canonicalModelRow,
      vendorEvidence: {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
        name: "Example Publisher",
        externalId: "1",
      },
    })
    expect(result).not.toHaveProperty("vendors")
    expect(result.data[0]).not.toHaveProperty("vendor_id")
  })

  it.each([
    ["missing registry", undefined],
    ["non-array registry", { 1: "Example Publisher" }],
  ])("keeps valid pricing when the %s cannot be joined", async (_, vendors) => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...modelRow, vendor_id: 1 }],
        ...(vendors === undefined ? {} : { vendors }),
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(canonicalModelRow)
  })

  it("ignores malformed registry entries and malformed row vendor ids", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          { ...modelRow, vendor_id: 1.5 },
          { ...modelRow, model_name: "second-model", vendor_id: "2" },
        ],
        vendors: [
          null,
          "invalid",
          { id: 1.5, name: "Fractional id" },
          { id: Number.POSITIVE_INFINITY, name: "Infinite id" },
          { id: 2, name: " " },
          { id: 3, name: 42 },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data).toEqual([
      canonicalModelRow,
      { ...canonicalModelRow, model_name: "second-model" },
    ])
  })

  it.each([
    [
      { id: 1, name: "Example Publisher" },
      { id: 1, name: "Other Publisher" },
    ],
    [
      { id: 1, name: "Other Publisher" },
      { id: 1, name: "Example Publisher" },
    ],
  ])("treats duplicate valid vendor ids as ambiguous", async (...vendors) => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...canonicalModelRow, vendor_id: 1 }],
        vendors,
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(canonicalModelRow)
  })

  it("ignores unknown row vendor ids", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...canonicalModelRow, vendor_id: 99 }],
        vendors: [{ id: 1, name: "Example Publisher" }],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(canonicalModelRow)
  })

  it("removes malformed pre-existing vendor evidence when no native join applies", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...canonicalModelRow,
            vendorEvidence: {
              kind: "not-a-kind",
              name: "  ",
              externalId: 42,
            },
          },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(canonicalModelRow)
  })

  it("strips pre-existing remote vendor evidence when no native join applies", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...canonicalModelRow,
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
              name: " Example Publisher ",
              externalId: " publisher-id ",
            },
          },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(canonicalModelRow)
  })

  it("prefers a valid native registry join over pre-existing canonical evidence", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...canonicalModelRow,
            vendor_id: 1,
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
              name: "Legacy Publisher",
            },
          },
        ],
        vendors: [{ id: 1, name: "Deployment Category" }],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0].vendorEvidence).toEqual({
      kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
      name: "Deployment Category",
      externalId: "1",
    })
  })

  it("does not mutate the raw native response while normalizing it", async () => {
    const rawResponse = pricingResponse({
      data: [
        {
          ...modelRow,
          vendor_id: 1,
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Legacy Publisher",
          },
        },
      ],
      vendors: [{ id: 1, name: "Deployment Category" }],
    })
    const originalSnapshot = structuredClone(rawResponse)
    fetchModelPricingMock.mockResolvedValueOnce(rawResponse)

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(rawResponse).toEqual(originalSnapshot)
    expect(result).not.toBe(rawResponse)
    expect(result.data[0]).not.toBe(rawResponse.data[0])
  })

  it.each([
    ["envelope", Object.create(pricingResponse())],
    [
      "row",
      pricingResponse({
        data: [Object.create(modelRow)],
      }),
    ],
  ])("rejects a prototype-backed pricing %s", async (_, response) => {
    fetchModelPricingMock.mockResolvedValueOnce(response)

    await expect(
      createNewApiModelPricing(SITE_TYPES.NEW_API).fetchPricing(request),
    ).rejects.toThrow("Invalid New API model pricing response")
  })

  it("ignores prototype-backed native registry entries", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...modelRow, vendor_id: 1 }],
        vendors: [Object.create({ id: 1, name: "Inherited Category" })],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(canonicalModelRow)
  })

  it("preserves canonical base fields and source metadata while stripping remote publisher claims", async () => {
    const remoteResponse = pricingResponse({
      data: [
        {
          ...modelRow,
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Example Publisher",
          },
        },
      ],
      group_ratio: { standard: 1 },
      usable_group: { standard: "Standard" },
      model_list_source: { kind: "catalog-fallback" },
    })
    fetchModelPricingMock.mockResolvedValueOnce(remoteResponse)

    await expect(
      createNewApiModelPricing(SITE_TYPES.NEW_API).fetchPricing(request),
    ).resolves.toEqual({
      data: [canonicalModelRow],
      group_ratio: { standard: 1 },
      success: true,
      usable_group: { standard: "Standard" },
      model_list_source: { kind: "catalog-fallback" },
    })
  })

  it("adapts current V-API group names when usable groups are omitted", async () => {
    fetchModelPricingMock.mockResolvedValueOnce({
      data: [modelRow],
      group_ratio: { standard: 1 },
      group_names: { standard: "Standard" },
      success: true,
    })

    await expect(
      createNewApiModelPricing(SITE_TYPES.V_API).fetchPricing(request),
    ).resolves.toEqual({
      data: [canonicalModelRow],
      group_ratio: { standard: 1 },
      success: true,
      usable_group: { standard: "Standard" },
    })
  })

  it("preserves legacy V-API usable groups when both group fields exist", async () => {
    fetchModelPricingMock.mockResolvedValueOnce({
      data: [modelRow],
      group_ratio: { legacy: 1 },
      group_names: { current: "Current" },
      success: true,
      usable_group: { legacy: "Legacy" },
    })

    await expect(
      createNewApiModelPricing(SITE_TYPES.V_API).fetchPricing(request),
    ).resolves.toEqual({
      data: [canonicalModelRow],
      group_ratio: { legacy: 1 },
      success: true,
      usable_group: { legacy: "Legacy" },
    })
  })

  it("retains shared validation for malformed V-API pricing envelopes", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(null)

    await expect(
      createNewApiModelPricing(SITE_TYPES.V_API).fetchPricing(request),
    ).rejects.toThrow("Invalid New API model pricing response")
  })

  it("normalizes cache read and write ratios without leaking native fields", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...modelRow,
            cache_ratio: 0,
            create_cache_ratio: 0,
          },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual({
      ...canonicalModelRow,
      token_price_ratios_to_input: {
        cache_read: 0,
        cache_write: 0,
      },
    })
    expect(result.data[0]).not.toHaveProperty("cache_ratio")
    expect(result.data[0]).not.toHaveProperty("create_cache_ratio")
  })

  it("omits malformed optional cache ratios and tiered-expression ratios", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          { ...modelRow, cache_ratio: -1, create_cache_ratio: Number.NaN },
          {
            ...modelRow,
            model_name: "tiered-model",
            billing_mode: "tiered_expr",
            cache_ratio: 0.5,
          },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).not.toHaveProperty("token_price_ratios_to_input")
    expect(result.data[1]).not.toHaveProperty("token_price_ratios_to_input")
  })

  it.each([
    null,
    [],
    {},
    { data: {} },
    { data: [], group_ratio: {}, success: true },
    { data: [], group_ratio: [], success: true, usable_group: {} },
    { data: [], group_ratio: {}, success: "yes", usable_group: {} },
    { data: [null], group_ratio: {}, success: true, usable_group: {} },
  ])("rejects a fundamentally invalid base response", async (response) => {
    fetchModelPricingMock.mockResolvedValueOnce(response)

    await expect(
      createNewApiModelPricing(SITE_TYPES.NEW_API).fetchPricing(request),
    ).rejects.toThrow("Invalid New API model pricing response")
  })
})

it("quotes flat token billing without applying the effective group rate twice, and refuses expression fallback", async () => {
  fetchModelPricingMock.mockResolvedValue(pricingResponse())
  const adapter = createNewApiModelPricing(SITE_TYPES.NEW_API)
  const flat = await adapter.fetchPricing(request)
  const scenario = {
    purpose: PRICING_PURPOSES.REQUEST,
    inputTokens: 1000,
    outputTokens: 1000,
    usage: { input: 1000, output: 1000, request: 1 },
  }
  expect(
    quoteCanonicalModelPrice(flat.data[0], scenario, { groupMultiplier: 0.5 }),
  ).toMatchObject({ status: "complete", amount: 0.002 })
  fetchModelPricingMock.mockResolvedValue(
    pricingResponse({
      data: [
        {
          ...modelRow,
          billing_mode: "tiered_expr",
          billing_expr: "arbitrary()",
        },
      ],
    }),
  )
  const expression = await adapter.fetchPricing(request)
  expect(
    quoteCanonicalModelPrice(expression.data[0], scenario, {
      groupMultiplier: 1,
    }).status,
  ).toBe("unavailable")
})

it("quotes the official versioned context expression without legacy ratio conversion", async () => {
  fetchModelPricingMock.mockResolvedValue(
    pricingResponse({
      data: [
        {
          ...modelRow,
          billing_mode: "tiered_expr",
          billing_expr:
            'v1:len <= 200000 ? tier("standard", p * 3 + c * 15 + cr * 0.3 + cc * 3.75 + cc1h * 6) : tier("long_context", p * 6 + c * 22.5 + cr * 0.6 + cc * 7.5 + cc1h * 12)',
        },
      ],
    }),
  )
  const response = await createNewApiModelPricing(
    SITE_TYPES.NEW_API,
  ).fetchPricing(request)
  const quote = (inputTokens: number) =>
    quoteCanonicalModelPrice(
      response.data[0],
      {
        purpose: PRICING_PURPOSES.REQUEST,
        inputTokens,
        outputTokens: 10000,
        usage: {
          input: inputTokens - 100000,
          output: 10000,
          cacheRead: 100000,
          cacheWrite: 0,
          cacheWrite1h: 0,
          request: 1,
        },
      },
      { groupMultiplier: 0.5 },
    )
  expect(quote(200000)).toMatchObject({ status: "complete", amount: 0.24 })
  expect(quote(300000)).toMatchObject({ status: "complete", amount: 0.7425 })
})

it.each([
  "p * 0.03 + c * 0.15 + 1 + 2",
  "p * 0.03 + c * 0.15; globalThis.alert(1)",
  "p * 0.03 + p * 0.15",
  "p * 1e999 + c * 0.15",
  'v2:tier("base", p * 3 + c * 15)',
  'tier("base", p * 3 + c * 15)|||when(header("x") == "y") * 2',
  'tier("base", p * 3 + c * 15 +)',
  'tier("base", p * 1e999)',
  'tier("base", p * 3);globalThis.alert(1)',
])(
  "rejects unsupported or malformed expression %s without falling back to ratio prices",
  async (billing_expr) => {
    fetchModelPricingMock.mockResolvedValue(
      pricingResponse({
        data: [{ ...modelRow, billing_mode: "tiered_expr", billing_expr }],
      }),
    )
    const response = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)
    expect(
      quoteCanonicalModelPrice(
        response.data[0],
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          inputTokens: 300000,
          usage: { input: 1 },
        },
        { groupMultiplier: 1 },
      ).status,
    ).toBe("unavailable")
  },
)

it("accepts Unicode tier labels and prices a flat expression without a context length", async () => {
  fetchModelPricingMock.mockResolvedValue(
    pricingResponse({
      data: [
        {
          ...modelRow,
          billing_mode: "tiered_expr",
          billing_expr: 'tier("普通 ≤ 272K", p * 3 + c * 15)',
        },
      ],
    }),
  )
  const response = await createNewApiModelPricing(
    SITE_TYPES.NEW_API,
  ).fetchPricing(request)
  expect(
    quoteCanonicalModelPrice(
      response.data[0],
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1, output: 1 } },
      { groupMultiplier: 1 },
    ),
  ).toMatchObject({ status: "complete", amount: 9 })
})

it("prices media tokens separately and resolves omitted cache pricing from the selected response format", async () => {
  fetchModelPricingMock.mockResolvedValue(
    pricingResponse({
      data: [
        {
          ...modelRow,
          billing_mode: "tiered_expr",
          billing_expr:
            'tier("media", p * 2 + c * 4 + img * 6 + ai * 8 + ao * 10 + img_o * 12)',
        },
      ],
    }),
  )
  const model = (
    await createNewApiModelPricing(SITE_TYPES.NEW_API).fetchPricing(request)
  ).data[0]
  expect(
    quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        responseFormat: PRICING_RESPONSE_FORMATS.OPENAI,
        usage: {
          input: 1,
          output: 1,
          imageInput: 1,
          imageOutput: 1,
          audioInput: 1,
          audioOutput: 1,
          cacheRead: 1,
        },
      },
      { groupMultiplier: 1 },
    ),
  ).toMatchObject({ status: "complete", amount: 44 / 7 })
  expect(
    quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        responseFormat: PRICING_RESPONSE_FORMATS.ANTHROPIC,
        usage: { cacheRead: 1 },
      },
      { groupMultiplier: 1 },
    ),
  ).toMatchObject({ status: "complete", amount: 0 })
})

it("applies request service-tier and local-hour factors after context selection", async () => {
  fetchModelPricingMock.mockResolvedValue(
    pricingResponse({
      data: [
        {
          ...modelRow,
          billing_mode: "tiered_expr",
          billing_expr:
            '(len <= 200000 ? tier("short", p * 2 + c * 4) : tier("long", p * 4 + c * 8)) * (param("service_tier") == "priority" ? 2 : 1) * (hour("Asia/Shanghai") >= 8 && hour("Asia/Shanghai") < 12 ? 0.5 : 1)',
        },
      ],
    }),
  )
  const model = (
    await createNewApiModelPricing(SITE_TYPES.NEW_API).fetchPricing(request)
  ).data[0]
  const quote = (at: string) =>
    quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        serviceTier: PRICING_SERVICE_TIERS.PRIORITY,
        inputTokens: 200001,
        at,
        usage: { input: 1, output: 1 },
      },
      { groupMultiplier: 0.5 },
    )
  expect(quote("2026-09-08T00:00:00Z")).toMatchObject({
    status: "complete",
    amount: 3,
  })
  expect(quote("2026-09-08T04:00:00Z").amount).toBe(6)
})
