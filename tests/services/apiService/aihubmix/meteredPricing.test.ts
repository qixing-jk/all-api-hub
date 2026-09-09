import { describe, expect, it } from "vitest"

import { buildAIHubMixMeteredImagePlan } from "~/services/apiService/aihubmix/meteredImagePricing"
import {
  buildAIHubMixAudioDurationPlan,
  buildAIHubMixCharacterPlan,
  buildAIHubMixFixedImagePlan,
  buildAIHubMixImageQualityPlan,
  buildAIHubMixLegacyVideoPlan,
  buildAIHubMixMeasuredOutputPlan,
  buildAIHubMixMeteredVideoPlan,
  buildAIHubMixReferenceVideoPlan,
  checkAIHubMixVideoPriceEvidence,
} from "~/services/apiService/aihubmix/meteredPricing"
import { buildAIHubMixWebsitePricingPlan } from "~/services/apiService/aihubmix/websitePricing"
import {
  PRICE_RATE_UNITS,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_SOURCE_KINDS,
  PRICING_VIDEO_INPUTS,
} from "~/services/modelPricing/pricingConstants"
import { pricingPlanSchema } from "~/services/modelPricing/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

import additional from "./additionalMediaFixtures.json"
import fixtures from "./taskBillingFixtures.json"

/** Public catalog price fields captured on 2026-09-09; IDs are not compiler inputs. */
function fixture(model: string) {
  return fixtures.find((row) => row.model === model)!
}

describe("public task billing compiled into shared pricing", () => {
  it.each([
    [
      { match: { megapixels: { gt: 1, lte: 2 } }, unit_price: 0.1 },
      { match: { size: "1k" }, unit_price: 0.2 },
    ],
    [{ match: { megapixels: { gt: 2, lte: 1 } }, unit_price: 0.1 }],
    [
      { match: { megapixels: { gt: 1, lte: 3 } }, unit_price: 0.1 },
      { match: { megapixels: { gt: 2, lte: 4 } }, unit_price: 0.2 },
    ],
  ])("rejects ambiguous image area schedules %#", (...price_rules) => {
    const plan = buildAIHubMixMeteredImagePlan(
      {
        model_name: "renamed",
        enabled_billing_items: ["image_generation"],
        metered_price_config: {
          image_generation: {
            unit: "image",
            fallback_unit_price: 0.1,
            price_rules,
          },
        },
      },
      { kind: PRICING_SOURCE_KINDS.CATALOG },
    )!
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: {},
        imageMegapixels: 2,
      }),
    ).toMatchObject({ status: "unavailable", amount: null })
  })
  it("does not infer unlisted image sizes or omit declared reference-image charges", () => {
    const config = {
      model_name: "renamed",
      enabled_billing_items: ["image_generation"],
      metered_price_config: {
        image_generation: {
          unit: "image",
          fallback_unit_price: 0.2,
          price_rules: [{ match: { size: "1k" }, unit_price: 0.1 }],
        },
      },
    }
    const plan = buildAIHubMixMeteredImagePlan(config, {
      kind: PRICING_SOURCE_KINDS.CATALOG,
    })!
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: {},
        imageSize: "2k",
      }).amount,
    ).toBeNull()
    const missingReference = buildAIHubMixMeteredImagePlan(
      { ...config, enabled_billing_items: ["image_generation", "image_input"] },
      { kind: PRICING_SOURCE_KINDS.CATALOG },
    )!
    expect(
      quoteModelPrice(missingReference, {
        purpose: PRICING_PURPOSES.REQUEST,
        usage: { image: 1, referenceImage: 1 },
        imageSize: "1k",
      }),
    ).toMatchObject({
      status: "partial",
      amount: 0.1,
      issues: expect.arrayContaining([
        { code: "unsupported-rule", meters: ["referenceImage"] },
      ]),
    })
    expect(
      quoteModelPrice(missingReference, {
        purpose: PRICING_PURPOSES.REQUEST,
        usage: { image: 1 },
        imageSize: "1k",
      }).issues,
    ).toContainEqual({ code: "usage-missing", meter: "referenceImage" })
  })
  it("quotes quality-only legacy tables without inventing a standard-price conflict", () => {
    const plan = buildAIHubMixLegacyVideoPlan(
      { generate: { standard: { "720p": 0.1, "1080p": 0.2 } } },
      "$0.1/S",
      { kind: PRICING_SOURCE_KINDS.CATALOG },
    )!
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        videoQuality: "1080P",
        usage: {},
      }),
    ).toMatchObject({ status: "complete", amount: 0.2 })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: {},
      }).amount,
    ).toBeNull()
  })
  it.each([0.1, 0.2])(
    "merges equivalent resolution keys only when prices agree: %s",
    (secondPrice) => {
      const plan = buildAIHubMixMeteredVideoPlan(
        {
          model_name: "video",
          enabled_billing_items: ["video_generation"],
          metered_price_config: {
            video_generation: {
              unit: PRICE_RATE_UNITS.SECOND,
              fallback_unit_price: 0.1,
              price_rules: [
                { match: { quality: "720P" }, unit_price: 0.1 },
                { match: { quality: "720p" }, unit_price: secondPrice },
              ],
            },
          },
        },
        { kind: PRICING_SOURCE_KINDS.CATALOG },
      )
      if (secondPrice !== 0.1) expect(plan).toBeUndefined()
      else {
        expect(plan!.rules).toHaveLength(1)
        expect(
          quoteModelPrice(plan!, {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            usage: {},
            videoQuality: "720p",
          }),
        ).toMatchObject({ status: "complete", amount: 0.1 })
      }
    },
  )
  it("quotes characters without treating the legacy token price as authoritative", () => {
    const plan = buildAIHubMixCharacterPlan(
      fixture("qwen-audio-3.0-tts-flash").note,
      { kind: PRICING_SOURCE_KINDS.CATALOG },
    )!
    expect(
      quoteModelPrice(pricingPlanSchema.parse(plan), {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1 },
      }),
    ).toMatchObject({
      status: "complete",
      unit: "thousand-characters",
      amount: 0.0141,
    })
    expect(
      buildAIHubMixCharacterPlan(
        "$0.141 / 10K characters plus processing fees",
        { kind: PRICING_SOURCE_KINDS.CATALOG },
      ),
    ).toBeUndefined()
  })

  it("quotes search units independently of the zero token rates", () => {
    const plan = buildAIHubMixWebsitePricingPlan(
      "renamed",
      fixture("cohere-rerank-v4.0-fast").billing,
    )
    expect(
      quoteModelPrice(pricingPlanSchema.parse(plan), {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1 },
      }),
    ).toMatchObject({ status: "complete", unit: "search-unit", amount: 0.002 })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.REQUEST,
        usage: { searchUnits: 3 },
      }).amount,
    ).toBeCloseTo(0.006)
    const invalid = JSON.parse(fixture("cohere-rerank-v4.0-fast").billing)
    invalid.token_based_tier_configs.tier1.model_ratio = 1
    expect(
      buildAIHubMixWebsitePricingPlan("renamed", invalid).source
        .rulesUnavailable,
    ).toBe(true)
  })

  it("includes reference images and megapixel tiers in image task comparisons", () => {
    const plan = buildAIHubMixWebsitePricingPlan(
      "renamed",
      fixture("doubao-seedream-5.0-pro").billing,
    )
    const quote = quoteModelPrice(pricingPlanSchema.parse(plan), {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      imageMegapixels: 2.36,
      usage: {},
      taskUsage: { image: 2, referenceImage: 3 },
    })
    expect(quote).toMatchObject({ status: "complete", unit: "image" })
    expect(quote.amount).toBeCloseTo((2 * 0.0471 + 3 * 0.00286) / 2)
  })

  it("offers known video quality rates and excludes unknown reference-image fees only when unused", () => {
    const plan = buildAIHubMixWebsitePricingPlan(
      "renamed",
      fixture("minimax-h3-max").billing,
    )
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        videoQuality: "480P",
        usage: {},
      }),
    ).toMatchObject({
      status: "complete",
      amount: 0.05112,
      unit: "video-second",
    })
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        videoQuality: "480P",
        usage: {},
        taskUsage: { referenceImage: 1 },
      }).status,
    ).toBe("partial")
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: {},
      }).issues,
    ).toContainEqual({ code: "condition-missing", meter: "videoSeconds" })
  })

  it("detects contradictory structured and prose video rates", () => {
    const row = fixture("minimax-h3")
    const plan = checkAIHubMixVideoPriceEvidence(
      buildAIHubMixWebsitePricingPlan("renamed", row.billing),
      row.note,
    )
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        videoQuality: "768P",
        usage: {},
      }),
    ).toMatchObject({
      status: "unavailable",
      issues: [{ code: "source-conflict" }],
    })
  })

  it.each([
    ["wan3.0-video", "480P", 0.04225],
    ["happyhorse-1.0-video-edit", "1080P", 0.2479],
  ])(
    "quotes corroborated legacy seconds for %s",
    (model, videoQuality, amount) => {
      const row = fixture(String(model))
      const plan = buildAIHubMixLegacyVideoPlan(row.legacy, row.note, {
        kind: PRICING_SOURCE_KINDS.CATALOG,
      })!
      expect(
        quoteModelPrice(pricingPlanSchema.parse(plan), {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          videoQuality: String(videoQuality),
          usage: {},
        }),
      ).toMatchObject({ status: "complete", unit: "video-second", amount })
    },
  )

  it("keeps contradictory legacy prices and notes out of rankings", () => {
    const row = fixture("happyhorse-1.1-t2v")
    const plan = buildAIHubMixLegacyVideoPlan(row.legacy, row.note, {
      kind: PRICING_SOURCE_KINDS.CATALOG,
    })!
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        videoQuality: "1080P",
        usage: {},
      }),
    ).toMatchObject({
      status: "unavailable",
      issues: [{ code: "source-conflict" }],
    })
    expect(
      buildAIHubMixLegacyVideoPlan(row.legacy, "720p: $0.1395 per image", {
        kind: PRICING_SOURCE_KINDS.CATALOG,
      }),
    ).toBeUndefined()
  })
})

it("requires video input and quality choices and charges the selected reference tier", () => {
  const row = additional.website.find(
    (row) => row.model === "doubao-seedance-2-0-260128",
  )!
  const plan = buildAIHubMixReferenceVideoPlan(
    row.img_price_config,
    row.display_input,
    { kind: PRICING_SOURCE_KINDS.CATALOG },
  )!
  expect(pricingPlanSchema.safeParse(plan).success).toBe(true)
  const missing = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    usage: { input: 1 },
  })
  expect(missing.status).toBe("unavailable")
  expect(missing.conditionDetails?.map((detail) => detail.axis)).toEqual(
    expect.arrayContaining(["videoQuality", "videoInput"]),
  )
  const withVideo = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.REQUEST,
    videoQuality: "720p",
    videoInput: PRICING_VIDEO_INPUTS.WITH_VIDEO,
    usage: { videoSeconds: 3 },
  })
  expect(withVideo.status).toBe("complete")
  expect(withVideo.amount).toBeCloseTo(0.171 * 3)
  expect(
    buildAIHubMixReferenceVideoPlan(
      row.img_price_config,
      row.display_input.replaceAll("/s", "/image"),
      { kind: PRICING_SOURCE_KINDS.CATALOG },
    ),
  ).toBeUndefined()
})

it("never infers a fixed image unit from the legacy table alone or ignores a conflict", () => {
  const table = { generate: { standard: { standard: 0.015 } } }
  const source = { kind: "catalog" as const }
  expect(buildAIHubMixFixedImagePlan(table, "", source)).toBeUndefined()
  expect(
    buildAIHubMixFixedImagePlan({ ...table, extra: 1 }, "$0.015 / IMG", source),
  ).toBeUndefined()
  const plan = buildAIHubMixFixedImagePlan(table, "$0.02 / IMG", source)!
  expect(
    quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 1 },
    }),
  ).toMatchObject({
    status: "unavailable",
    issues: [{ code: "source-conflict" }],
  })
})

it("uses complete scalar notes without accepting partial prices or malformed tables", () => {
  const source = { kind: "catalog" as const }
  expect(
    buildAIHubMixFixedImagePlan("", "$ 0.08 / IMG", source)?.rates.image
      ?.amount,
  ).toBe(0.08)
  expect(
    buildAIHubMixFixedImagePlan("broken", "$0.08 / IMG", source),
  ).toBeUndefined()
  expect(
    buildAIHubMixFixedImagePlan("", "$0.08 / IMG plus fees", source),
  ).toBeUndefined()
  const table = {
    generate: { standard: { standard: 0.12, "720p": 0.1, "1080p": 0.12 } },
  }
  const plan = buildAIHubMixLegacyVideoPlan(table, "$0.12 / S", source)!
  expect(
    quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      videoQuality: "720p",
      usage: { input: 1 },
    }).amount,
  ).toBe(0.1)
  expect(
    quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 1 },
    }).status,
  ).toBe("unavailable")
  const conflict = buildAIHubMixLegacyVideoPlan(table, "$0.2 / S", source)!
  expect(
    quoteModelPrice(conflict, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      videoQuality: "720p",
      usage: { input: 1 },
    }).issues,
  ).toContainEqual({ code: "source-conflict" })
})

it("converts an audio hour rate once for unit comparison and duration estimates", () => {
  const plan = buildAIHubMixAudioDurationPlan("$0.111/h", {
    kind: PRICING_SOURCE_KINDS.CATALOG,
  })!
  expect(pricingPlanSchema.safeParse(plan).success).toBe(true)
  const unit = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    usage: { input: 80, output: 20 },
  })
  expect(unit).toMatchObject({ status: "complete", unit: "audio-second" })
  expect(unit.amount).toBeCloseTo(0.111 / 3600, 10)
  expect(
    quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.REQUEST,
      usage: { audio: 3600 },
    }).amount,
  ).toBeCloseTo(0.111)
  expect(
    buildAIHubMixAudioDurationPlan("$0.111/h plus storage", {
      kind: PRICING_SOURCE_KINDS.CATALOG,
    }),
  ).toBeUndefined()
})

it.each([
  ["page", "pages", "standard", 3, 0.025],
  ["megapixel", PRICING_METERS.OUTPUT_MEGAPIXELS, "per_megapixel", 2.5, 0.03],
] as const)(
  "quotes %s quantities and excludes conflicting evidence",
  (unit, meter, key, quantity, amount) => {
    const table = { generate: { standard: { [key]: amount } } }
    const note = `$${amount}/${unit === "page" ? "page" : "MP"}`
    const plan = pricingPlanSchema.parse(
      buildAIHubMixMeasuredOutputPlan(table, note, {
        kind: PRICING_SOURCE_KINDS.CATALOG,
      }),
    )
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.REQUEST,
        usage: { [meter]: quantity },
      }).amount,
    ).toBeCloseTo(amount * quantity)
    expect(
      quoteModelPrice(plan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 80, output: 20 },
        taskUsage: { [meter]: quantity },
      }),
    ).toMatchObject({ status: "complete", unit, amount })
    const missing = quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: {},
      taskUsage: { [meter]: null },
    })
    expect(missing.status).toBe("unavailable")
    expect(missing.requirementDetails).toContainEqual(
      expect.objectContaining({ axis: meter }),
    )
    const conflict = buildAIHubMixMeasuredOutputPlan(
      table,
      "$9/" + (unit === "page" ? "page" : "MP"),
      { kind: PRICING_SOURCE_KINDS.CATALOG },
    )!
    expect(
      quoteModelPrice(conflict, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: {},
      }),
    ).toMatchObject({
      status: "unavailable",
      issues: [{ code: "source-conflict" }],
    })
    expect(
      buildAIHubMixMeasuredOutputPlan(table, note + " + extra fee", {
        kind: PRICING_SOURCE_KINDS.CATALOG,
      }),
    ).toBeUndefined()
    expect(
      buildAIHubMixMeasuredOutputPlan(
        { generate: { standard: { wrong: amount } } },
        note,
        { kind: PRICING_SOURCE_KINDS.CATALOG },
      ),
    ).toBeUndefined()
  },
)

it("requires the published image quality and never silently selects another tier", () => {
  const plan = pricingPlanSchema.parse(
    buildAIHubMixImageQualityPlan("", "$ 0.09 / IMG (Quality)", {
      kind: PRICING_SOURCE_KINDS.CATALOG,
    }),
  )
  const scenario = { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: {} } as const
  expect(quoteModelPrice(plan, scenario)).toMatchObject({
    status: "unavailable",
    conditionDetails: [{ axis: "imageQuality", available: ["Quality"] }],
  })
  expect(
    quoteModelPrice(plan, { ...scenario, imageQuality: "Quality" }),
  ).toMatchObject({ status: "complete", amount: 0.09, unit: "image" })
  expect(
    quoteModelPrice(plan, { ...scenario, imageQuality: "fast" }).status,
  ).toBe("unavailable")
  expect(
    buildAIHubMixImageQualityPlan("{}", "$0.09/IMG (Quality)", {
      kind: PRICING_SOURCE_KINDS.CATALOG,
    }),
  ).toBeUndefined()
  expect(
    buildAIHubMixImageQualityPlan("", "$0.09/IMG (Quality) + extras", {
      kind: PRICING_SOURCE_KINDS.CATALOG,
    }),
  ).toBeUndefined()
})
