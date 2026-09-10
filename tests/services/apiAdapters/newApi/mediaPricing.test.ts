import { describe, expect, it } from "vitest"

import { parseMediaPriceExpression } from "~/services/apiAdapters/newApi/mediaPriceExpression"
import { normalizeNewApiModelPricingResponse } from "~/services/apiAdapters/newApi/modelPricingDto"
import {
  PRICE_RATE_UNITS,
  PRICING_PURPOSES,
  PRICING_VIDEO_INPUTS,
} from "~/services/modelPricing/pricingConstants"
import type { PricingScenario } from "~/services/modelPricing/pricingPlan"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import rows from "~~/tests/fixtures/newApi/mediaPricing.json"

/** Exercise the native adapter boundary without using a model-name dispatch. */
function normalize(row: object) {
  return normalizeNewApiModelPricingResponse({
    data: [
      {
        model_ratio: 0,
        completion_ratio: 0,
        enable_groups: [],
        supported_endpoint_types: [],
        ...row,
      },
    ],
    success: true,
    group_ratio: {},
    usable_group: {},
  }).data[0]
}

describe("public media pricing contracts captured 2026-09-09", () => {
  it("evaluates conjunctions before alternatives in media price selections", () => {
    const expression = parseMediaPriceExpression(
      'resolution == "720p" && video_input || resolution == "1080p" ? 2 : 1',
    )!
    expect(expression.evaluate({ resolution: "720p", video_input: true })).toBe(
      2,
    )
    expect(
      expression.evaluate({ resolution: "720p", video_input: false }),
    ).toBe(1)
    expect(
      expression.evaluate({ resolution: "1080p", video_input: false }),
    ).toBe(2)
    expect(expression.evaluate({ resolution: "480p", video_input: true })).toBe(
      1,
    )
  })
  it.each([
    "resolution == 1 ? 2 : 3",
    "video_input ? : 3",
    'resolution == "" ? 2 : 3',
  ])("rejects incomplete media selection literals: %s", (expression) =>
    expect(parseMediaPriceExpression(expression)).toBeUndefined(),
  )
  it("explains missing resolution independently from video input and usage quantities", () => {
    const model = normalize(
      rows.find((row) => row.model_name === "doubao-seedance-2-0-260128")!,
    )
    const quote = quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: {},
        videoInput: PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
      },
      { groupMultiplier: 1 },
    )
    expect(quote.conditionDetails).toEqual([
      {
        axis: "videoQuality",
        selected: undefined,
        available: ["1080p", "480p", "4k", "720p"],
      },
    ])
  })
  it.each(["wan2.7-t2v", "wan2.7-i2v", "doubao-seedance-2-0-260128"])(
    "shares a 720P scenario across providers for %s",
    (name) => {
      const model = normalize(rows.find((row) => row.model_name === name)!)
      const quote = quoteCanonicalModelPrice(
        model,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: { input: 80, output: 20 },
          videoQuality: "720P",
          videoInput: PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
        },
        { groupMultiplier: 1 },
      )
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(
        name.startsWith("wan") ? 0.0821917808 : 6.301369863,
        10,
      )
    },
  )
  const video = rows.find(
    (row) => row.model_name === "doubao-seedance-2-0-260128",
  )!
  const flatImage = rows.find((row) => row.model_name === "wan2.7-image")!
  const scenario: PricingScenario = {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    usage: { input: 80, output: 20 },
    videoQuality: "720p",
    videoInput: PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
  }

  it.each([
    { ...flatImage, quota_type: 9 },
    {
      ...flatImage,
      price_presentation: { ...flatImage.price_presentation, kind: "video" },
    },
    {
      ...flatImage,
      price_presentation: {
        ...flatImage.price_presentation,
        items: flatImage.price_presentation.items!.map((item) => ({
          ...item,
          resolution: "unsupported",
        })),
      },
    },
    {
      ...flatImage,
      price_presentation: {
        ...flatImage.price_presentation,
        items: flatImage.price_presentation.items!.map((item) => ({
          ...item,
          resolution: "1k",
        })),
      },
    },
    {
      ...flatImage,
      price_presentation: {
        ...flatImage.price_presentation,
        items: flatImage.price_presentation.items!.map((item) => ({
          ...item,
          video_input: false,
        })),
      },
    },
    { ...flatImage, billing_expr: 'v2:tier("base", unit(outputs, 0.03))' },
    { ...flatImage, billing_expr: flatImage.billing_expr + " + 1" },
    {
      ...flatImage,
      billing_expr: 'v3:tier("base", unit(outputs, 0.0273972603))',
    },
    {
      ...flatImage,
      billing_expr:
        'v2:tier("base", unit(outputs, video_input ? 0.0273972603 : unknown(1)))',
    },
    { ...flatImage, billing_expr: 'v2:tier("base", unit(outputs, 1e999))' },
    {
      ...flatImage,
      billing_expr: `v2:tier("base", unit(outputs, ${"(".repeat(40)}0.0273972603${")".repeat(40)}))`,
    },
    { ...flatImage, billing_expr: "x".repeat(16001) },
    {
      ...flatImage,
      billing_usage_schema: {
        seconds: { type: "number", unit: PRICE_RATE_UNITS.SECOND },
      },
    },
    {
      ...video,
      price_presentation: {
        ...video.price_presentation,
        items: video.price_presentation.items!.slice(1),
      },
    },
    {
      ...video,
      price_presentation: {
        ...video.price_presentation,
        items: [
          ...video.price_presentation.items!,
          video.price_presentation.items![0],
        ],
      },
    },
  ])(
    "does not certify conflicting, incomplete, or unknown contracts %#",
    (row) => {
      const quote = quoteCanonicalModelPrice(normalize(row), scenario, {
        groupMultiplier: 1,
      })
      expect(quote.status).toBe("unavailable")
      expect(quote.amount).toBeNull()
    },
  )

  it.each([
    {},
    { videoQuality: "720p" },
    { videoQuality: "unknown", videoInput: PRICING_VIDEO_INPUTS.WITHOUT_VIDEO },
  ])("requires declared video conditions %j", (conditions) => {
    const quote = quoteCanonicalModelPrice(
      normalize(video),
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 80 },
        ...conditions,
      } as PricingScenario,
      { groupMultiplier: 1 },
    )
    expect(quote.status).toBe("unavailable")
  })

  it("settles actual image counts and seconds without token-weight leakage", () => {
    for (const [row, usage, expected] of [
      [flatImage, { image: 3 }, 0.0273972603 * 3],
      [
        rows.find((row) => row.model_name === "MiniMax-H3")!,
        { videoSeconds: 5 },
        0.1095890411 * 5,
      ],
    ] as const) {
      const quote = quoteCanonicalModelPrice(
        normalize(row),
        { purpose: PRICING_PURPOSES.REQUEST, usage },
        { groupMultiplier: 2 },
      )
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(expected * 2, 10)
    }
  })

  it.each([0, 0.01, 2.5])(
    "honors official v1 fixed(%s) USD request prices",
    (amount) => {
      const model = normalize({
        model_name: "official",
        quota_type: 0,
        billing_mode: "tiered_expr",
        billing_expr: `v1:tier("request", fixed(${amount}))`,
      })
      const quote = quoteCanonicalModelPrice(model, scenario, {
        groupMultiplier: 2,
      })
      expect(quote.status).toBe("complete")
      expect(quote.unit).toBe("request")
      expect(quote.amount).toBe(amount * 2)
    },
  )

  it("gives official fixed pricing precedence over extension presentation", () => {
    const quote = quoteCanonicalModelPrice(
      normalize({
        ...flatImage,
        billing_expr: 'v1:tier("request", fixed(0.5))',
      }),
      scenario,
      { groupMultiplier: 2 },
    )
    expect(quote).toMatchObject({
      status: "complete",
      amount: 1,
      unit: "request",
    })
  })

  it.each([
    [100, 0.01],
    [32001, 0.03],
  ])(
    "selects official fixed tiers for input length %s",
    (inputTokens, amount) => {
      const model = normalize({
        model_name: "official",
        quota_type: 0,
        billing_mode: "tiered_expr",
        billing_expr:
          'len <= 32000 ? tier("short", fixed(0.01)) : tier("long", fixed(0.03))',
      })
      const quote = quoteCanonicalModelPrice(
        model,
        { ...scenario, inputTokens },
        { groupMultiplier: 1 },
      )
      expect(quote).toMatchObject({
        status: "complete",
        amount,
        unit: "request",
      })
    },
  )

  it.each([
    'tier("bad", fixed(0.01) + p * 2)',
    'tier("bad", fixed(-1))',
    'tier("bad", fixed(1e309))',
    'len < 100 ? tier("fixed", fixed(0.01)) : tier("tokens", p * 2)',
    'tier("bad", fixed(0.01)) + tier("other", fixed(0.01))',
  ])(
    "keeps unrepresentable official fixed contracts unquoted: %s",
    (billing_expr) => {
      const model = normalize({
        model_name: "official",
        quota_type: 0,
        billing_mode: "tiered_expr",
        billing_expr,
      })
      expect(
        quoteCanonicalModelPrice(
          model,
          { ...scenario, inputTokens: 10 },
          { groupMultiplier: 1 },
        ).status,
      ).toBe("unavailable")
    },
  )
  for (const row of rows) {
    for (const item of (
      row.price_presentation as {
        items?: {
          key: string
          amount: number
          unit: string
          resolution?: string
          video_input?: boolean
        }[]
      }
    ).items ?? []) {
      it(`${row.model_name}: quotes ${item.key} independently of model identity`, () => {
        const model = normalize({ ...row, model_name: "unrelated-model" })
        const scenario: PricingScenario = {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: { input: 80, output: 20 },
          imageSize: item.resolution as PricingScenario["imageSize"],
          videoQuality: item.resolution,
          videoInput:
            item.video_input === undefined
              ? undefined
              : item.video_input
                ? PRICING_VIDEO_INPUTS.WITH_VIDEO
                : PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
        }
        const quote = quoteCanonicalModelPrice(model, scenario, {
          groupMultiplier: 2,
        })
        expect(quote.status).toBe("complete")
        expect(quote.amount).toBeCloseTo(item.amount * 2, 10)
        expect(quote.unit).toBe(
          item.unit === "second"
            ? "video-second"
            : item.unit === "image"
              ? "image"
              : "million-video-output-tokens",
        )
      })
    }
  }

  it("preserves native per-request pricing with image presentation metadata", () => {
    const model = normalize(
      rows.find((row) => row.model_name === "gpt-image-1.5")!,
    )
    const quote = quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 80, output: 20 },
      },
      { groupMultiplier: 2 },
    )
    expect(quote.status).toBe("complete")
    expect(quote.unit).toBe("request")
    expect(quote.amount).toBeCloseTo(0.010959 * 2)
  })
})
