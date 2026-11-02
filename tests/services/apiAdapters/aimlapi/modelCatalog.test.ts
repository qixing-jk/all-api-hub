import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createProfileSource } from "~/features/ModelList/catalog/modelManagementSources"
import { buildPricingDiagnostics } from "~/features/ModelList/pricing/pricingDiagnostics"
import { aimlApiProviderModelCatalog } from "~/services/apiAdapters/aimlapi/modelCatalog"
import {
  AIMLAPI_CHARGE_TYPES as chargeTypes,
  AIMLAPI_MODEL_ENDPOINT_TYPES as endpointTypes,
  AIMLAPI_PRICING_CONTENTS as pricingContents,
  AIMLAPI_PRICING_KINDS as pricingKinds,
  AIMLAPI_PRICING_ORIGINS as pricingOrigins,
  AIMLAPI_PRICING_UNITS as pricingUnits,
} from "~/services/apiService/aimlapi/constants"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import { isValidProviderModelCatalogPricing } from "~/services/modelList/providerCatalogAdmission"
import {
  PRICING_SOURCE_NOTE_KINDS as noteKinds,
  PRICING_DOCUMENT_ANNOTATIONS,
  PRICING_SEARCH_CONTEXTS,
  PRICING_VIDEO_DYNAMIC_RANGES,
} from "~/services/modelPricing/pricingConstants"
import { readPublishedPricing } from "~/services/modelPricing/publishedPricing"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"
import { server } from "~~/tests/msw/server"

const pricingUrl = "https://aimlapi.com/ai-ml-api-pricing"
const browseDiagnostics = (model: ModelPricing) =>
  buildPricingDiagnostics([
    {
      model,
      source: createProfileSource({
        id: "aimlapi-audit",
        name: "AI/ML API",
        apiType: "openai-compatible",
        baseUrl: "https://aimlapi.com",
        apiKey: "",
        notes: "",
        tagIds: [],
        createdAt: 0,
        updatedAt: 0,
      }),
      calculatedPrice: {
        ...calculateModelPrice(model, 1),
        isComparisonActive: false,
        publishedPricing: readPublishedPricing(model.pricingPlan!, 1),
      },
    },
  ])
const table = (rows: string) =>
  `<table><thead><tr><th>Provider</th><th>Model</th><th>Modalities</th><th>Capabilities</th><th>Context</th><th>Input</th><th>Output</th><th>Links</th></tr></thead><tbody><tr data-c="l"><th colspan="8">Language Models <span>per 1M tokens</span></th></tr>${rows}</tbody></table>`
const row = (
  id: string,
  input = "$2<small>cache $0.2</small>",
  output = "$10",
  category = "l",
) =>
  `<tr data-c="${category}" data-id="${id}"><td>Moonshot AI</td><td>Kimi</td><td></td><td></td><td>1M tokens</td><td>${input}</td><td>${output}</td><td></td></tr>`

function mockCatalog(ids = ["moonshot/kimi-k3-1-pro"]) {
  server.use(
    http.get("https://api.aimlapi.com/v1/models", () =>
      HttpResponse.json({
        data: ids.map((id) => ({
          id,
          info: { name: id, developer: "Moonshot AI" },
          type: endpointTypes.Chat,
        })),
      }),
    ),
  )
}

describe("AIMLAPI catalog pricing", () => {
  it.each([
    "normal",
    "reversed",
    "different-output",
    "different-cache",
    "missing-output",
    "unknown-endpoint",
  ])(
    "uses only a complete price with matching repeated fields (%s)",
    async (mode) => {
      const unit = (origin: string, price: number) => ({
        type: chargeTypes.Charge,
        name: pricingUnits.Token,
        content: pricingContents.Text,
        origin,
        price,
        per: 1000000,
        variable: false,
      })
      const pricing = {
        kind: pricingKinds.Fixed,
        currency: "USD",
        thresholds: [],
        dimensions: [],
        variants: [],
      }
      const data = [
        {
          id: "provider/same-model",
          info: { name: "Same model", developer: "Provider" },
          type: endpointTypes.Chat as string,
          pricing: {
            ...pricing,
            units: [
              unit(pricingOrigins.Provided, 2),
              unit(pricingOrigins.Generated, 8),
              unit(pricingOrigins.Cached, 0.5),
            ],
          },
        },
        {
          id: "provider/same-model",
          info: { name: "Same model", developer: "Provider" },
          type: endpointTypes.Responses,
          pricing: { ...pricing, units: [unit(pricingOrigins.Generated, 8)] },
        },
      ]
      if (mode === "different-output") data[1]!.pricing.units[0]!.price = 9
      if (mode === "different-cache")
        data[1]!.pricing.units.push(unit(pricingOrigins.Cached, 1))
      if (mode === "missing-output")
        data[0]!.pricing.units = [unit(pricingOrigins.Provided, 2)]
      if (mode === "unknown-endpoint") data[1]!.type = "internal/other"
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () =>
          HttpResponse.json({
            data: mode === "reversed" ? [...data].reverse() : data,
          }),
        ),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      const model = result.data[0]!
      const quote = quoteCanonicalModelPrice(
        model,
        {
          purpose: "request",
          usage: { input: 1000, output: 2000, cacheRead: 1000 },
        },
        { currency: "USD" },
      )
      if (!["normal", "reversed"].includes(mode)) {
        expect(quote.status).not.toBe("complete")
        expect(browseDiagnostics(model).summary.attention).toBe(1)
        return
      }
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(0.0185, 10)
      expect(browseDiagnostics(model).summary.attention).toBe(0)
      expect(
        isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI),
      ).toBe(true)
    },
  )
  it.each(["unknown-model", "changed-cutoff", "extra-tier", "missing-output"])(
    "does not infer threshold selection from a model name or an incomplete contract (%s)",
    async (change) => {
      const unit = (origin: string, price: number) => ({
        type: chargeTypes.Charge,
        name: pricingUnits.Token,
        content: pricingContents.Text,
        origin,
        price,
        per: 1000000,
        variable: false,
      })
      const tiers = [
        {
          from: 0,
          units: [
            unit(pricingOrigins.Provided, 1),
            unit(pricingOrigins.Generated, 5),
          ],
        },
        {
          from: change === "changed-cutoff" ? 128000 : 272000,
          units: [
            unit(pricingOrigins.Provided, 2),
            unit(pricingOrigins.Generated, 7.5),
          ],
        },
      ]
      if (change === "extra-tier")
        tiers.push({
          from: 400000,
          units: [
            unit(pricingOrigins.Provided, 3),
            unit(pricingOrigins.Generated, 10),
          ],
        })
      if (change === "missing-output") tiers[1]!.units.pop()
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () =>
          HttpResponse.json({
            data: [
              {
                id:
                  change === "unknown-model"
                    ? "other/same-threshold"
                    : "openai/gpt-6.1-terra",
                info: { name: "Tiered model", developer: "Provider" },
                type: endpointTypes.Chat,
                pricing: {
                  kind: pricingKinds.Fixed,
                  currency: "USD",
                  units: tiers[0]!.units,
                  dimensions: [],
                  variants: [],
                  thresholds: tiers,
                },
              },
            ],
          }),
        ),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      const model = result.data[0]!
      expect(
        quoteCanonicalModelPrice(
          model,
          {
            purpose: "token-index",
            inputTokens: 300000,
            usage: { input: 85, output: 15 },
          },
          { currency: "USD" },
        ).status,
      ).not.toBe("complete")
      expect(browseDiagnostics(model).summary.attention).toBe(1)
    },
  )
  it.each([
    "edit-only",
    "generate-first",
    "edit-first",
    "contradictory-edit",
    "contradictory-output",
  ])(
    "quotes separate input and output image counts across endpoint records (%s)",
    async (mode) => {
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () => {
          const edit = {
            id: "image/with-input-charge",
            info: { name: "Image with input charge", developer: "Provider" },
            type: endpointTypes.ImageEditing as string,
            pricing: {
              kind: pricingKinds.Variants,
              currency: "USD",
              thresholds: [],
              dimensions: ["resolution"],
              units: [
                {
                  type: chargeTypes.Charge,
                  name: pricingUnits.Generation,
                  content: pricingContents.Image,
                  origin: pricingOrigins.Generated,
                  measure: "count",
                  price: null,
                  per: 1,
                  variable: true,
                },
                {
                  type: chargeTypes.Charge,
                  name: pricingUnits.Payload,
                  content: pricingContents.Image,
                  origin: pricingOrigins.Provided,
                  measure: "count",
                  price: 0.01,
                  per: 1,
                  variable: true,
                },
              ],
              variants: [
                {
                  when: { resolution: "2k" },
                  price: 0.07,
                  per: 1,
                  unit: "generation",
                },
              ],
            },
          }
          const generation = structuredClone(edit)
          generation.type = endpointTypes.ImageGeneration
          generation.pricing.units = generation.pricing.units.slice(0, 1)
          const data =
            mode === "edit-only"
              ? [edit]
              : mode === "generate-first"
                ? [generation, edit]
                : [edit, generation]
          if (mode === "contradictory-edit") {
            const duplicate = structuredClone(edit)
            duplicate.pricing.units[1]!.price = 0.02
            data.push(duplicate)
          }
          if (mode === "contradictory-output")
            generation.pricing.variants[0]!.price = 0.08
          return HttpResponse.json({ data })
        }),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      const model = result.data[0]!
      const quote = (referenceImage: number | undefined) =>
        quoteCanonicalModelPrice(
          model,
          {
            purpose: "request",
            imageSize: "2k",
            usage: { image: 2, referenceImage },
          },
          { currency: "USD" },
        )
      if (mode.startsWith("contradictory")) {
        expect(quote(3).status).not.toBe("complete")
        expect(browseDiagnostics(model).summary.attention).toBe(1)
        return
      }
      expect(quote(3).status).toBe("complete")
      expect(quote(3).amount).toBeCloseTo(0.17, 10)
      expect(quote(0).amount).toBeCloseTo(0.14, 10)
      expect(quote(undefined).status).not.toBe("complete")
      expect(model.pricingPlan?.rates.outputImage).toBeUndefined()
      expect(browseDiagnostics(model).summary.attention).toBe(0)
      expect(
        isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI),
      ).toBe(true)
    },
  )
  it("selects search-context fees without summing tiers, assuming a default, or omitting unknown search usage", async () => {
    const units = [
      {
        type: chargeTypes.Charge,
        name: pricingUnits.Token,
        content: pricingContents.Text,
        origin: pricingOrigins.Provided,
        price: 1,
        per: 1000000,
        variable: false,
      },
      {
        type: chargeTypes.Charge,
        name: pricingUnits.Token,
        content: pricingContents.Text,
        origin: pricingOrigins.Generated,
        price: 1,
        per: 1000000,
        variable: false,
      },
      ...["low", "medium", "high"].map((tier, index) => ({
        type: chargeTypes.Charge,
        name: pricingUnits.Call,
        content: "structured",
        origin: pricingOrigins.Generated,
        price: [0.005, 0.008, 0.012][index],
        per: 1,
        variable: false,
        tag: { type: "tool", name: `websearch_context_${tier}` },
      })),
    ]
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "search/context",
              info: { name: "Search context", developer: "Provider" },
              type: endpointTypes.Chat,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units,
                thresholds: [],
                dimensions: [],
                variants: [],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    for (const [searchContext, amount] of [
      [PRICING_SEARCH_CONTEXTS.LOW, 0.008],
      [PRICING_SEARCH_CONTEXTS.MEDIUM, 0.011],
      [PRICING_SEARCH_CONTEXTS.HIGH, 0.015],
    ] as const) {
      const quote = quoteCanonicalModelPrice(
        model,
        {
          purpose: "request",
          searchContext,
          usage: { input: 1000, output: 2000, search: 1 },
        },
        { currency: "USD" },
      )
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(amount, 10)
    }
    const missingCount = quoteCanonicalModelPrice(
      model,
      {
        purpose: "request",
        searchContext: PRICING_SEARCH_CONTEXTS.LOW,
        usage: { input: 1000, output: 2000 },
      },
      { currency: "USD" },
    )
    expect(
      missingCount.issues.filter(
        (issue) => issue.code === "usage-missing" && issue.meter === "search",
      ),
    ).toHaveLength(1)
    for (const usage of [
      { input: 1000, output: 2000 },
      { input: 1000, output: 2000, search: 1 },
    ])
      expect(
        quoteCanonicalModelPrice(
          model,
          { purpose: "request", usage },
          { currency: "USD" },
        ).status,
      ).not.toBe("complete")
    expect(
      quoteCanonicalModelPrice(
        model,
        { purpose: "request", usage: { input: 1000, output: 2000, search: 0 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "complete", amount: 0.003 })
    expect(
      quoteCanonicalModelPrice(
        model,
        { purpose: "token-index", usage: { input: 1, output: 1 } },
        { currency: "USD" },
      ).status,
    ).toBe("complete")
    expect(browseDiagnostics(model).summary.attention).toBe(0)
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })
  it.each([chargeTypes.Charge, chargeTypes.Hold])(
    "handles %s separately generated images without charging reservations as consumed images",
    async (imageChargeType) => {
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () =>
          HttpResponse.json({
            data: [
              {
                id: "video/generated-references",
                info: {
                  name: "Video generated references",
                  developer: "Provider",
                },
                type: endpointTypes.VideoGeneration,
                pricing: {
                  kind: pricingKinds.Variants,
                  currency: "USD",
                  thresholds: [],
                  dimensions: ["resolution"],
                  units: [
                    {
                      type: chargeTypes.Charge,
                      name: pricingUnits.Second,
                      content: pricingContents.Video,
                      origin: pricingOrigins.Generated,
                      price: 0.13,
                      per: 1,
                      variable: true,
                    },
                    {
                      type: imageChargeType,
                      name: pricingUnits.Generation,
                      content: pricingContents.Image,
                      origin: pricingOrigins.Generated,
                      price: 0.04,
                      per: 1,
                      variable: true,
                    },
                  ],
                  variants: [
                    {
                      when: { resolution: "2K" },
                      price: 0.13,
                      per: 1,
                      unit: "second",
                    },
                  ],
                },
              },
            ],
          }),
        ),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      const model = result.data[0]!
      const quote = quoteCanonicalModelPrice(
        model,
        {
          purpose: "request",
          videoQuality: "2k",
          usage: { videoSeconds: 5, outputImage: 2 },
        },
        { currency: "USD" },
      )
      if (imageChargeType === chargeTypes.Hold) {
        expect(model.pricingPlan?.rates.outputImage).toBeUndefined()
        expect(quote.status).not.toBe("complete")
        return
      }
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(0.73, 10)
      expect(
        quoteCanonicalModelPrice(
          model,
          {
            purpose: "request",
            videoQuality: "2k",
            usage: { videoSeconds: 5 },
          },
          { currency: "USD" },
        ).status,
      ).not.toBe("complete")
      expect(model.pricingPlan?.rates.referenceImage).toBeUndefined()
      expect(browseDiagnostics(model).summary.attention).toBe(0)
      expect(
        isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI),
      ).toBe(true)
    },
  )
  it("does not turn zero generation placeholders into free per-image comparisons for token-priced images", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "image/token-priced",
              info: { name: "Token-priced image", developer: "Provider" },
              type: endpointTypes.ImageGeneration,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                thresholds: [],
                dimensions: [],
                variants: [],
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Image,
                    origin: pricingOrigins.Generated,
                    price: 30,
                    per: 1000000,
                    variable: false,
                  },
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Generation,
                    content: pricingContents.Image,
                    origin: pricingOrigins.Generated,
                    price: 0,
                    per: 1,
                    variable: false,
                  },
                ],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    const comparison = quoteCanonicalModelPrice(
      model,
      { purpose: "token-index", usage: { input: 1, output: 1 } },
      { currency: "USD" },
    )
    expect(comparison.status).not.toBe("complete")
    expect(comparison.amount).not.toBe(0)
    const request = quoteCanonicalModelPrice(
      model,
      { purpose: "request", usage: { imageOutput: 2000 } },
      { currency: "USD" },
    )
    expect(request.status).toBe("complete")
    expect(request.amount).toBeCloseTo(0.06, 10)
    expect(model.pricingPlan?.comparison?.meter).not.toBe("image")
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })
  it("adds distinct search, code execution, video-input and cached-image charges instead of excluding them", async () => {
    const units = [
      {
        name: pricingUnits.Token,
        content: pricingContents.Text,
        origin: pricingOrigins.Provided,
        price: 2,
        per: 1000000,
      },
      {
        name: pricingUnits.Token,
        content: pricingContents.Video,
        origin: pricingOrigins.Provided,
        price: 4,
        per: 1000000,
      },
      {
        name: pricingUnits.Token,
        content: pricingContents.Image,
        origin: pricingOrigins.Cached,
        price: 0.5,
        per: 1000000,
      },
      {
        name: pricingUnits.Call,
        content: "structured",
        origin: pricingOrigins.Generated,
        price: 0.01,
        per: 1,
        tag: { type: "tool", name: "websearch_tool" },
      },
      {
        name: pricingUnits.Call,
        content: "structured",
        origin: pricingOrigins.Generated,
        price: 0.05,
        per: 1,
        tag: { type: "tool", name: "code_execution" },
      },
    ].map((unit) => ({
      type: chargeTypes.Charge,
      phase: "inference",
      variable: false,
      ...unit,
    }))
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "multimodal/tools",
              info: { name: "Multimodal tools", developer: "Provider" },
              type: endpointTypes.Chat,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units,
                thresholds: [],
                dimensions: [],
                variants: [],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    const quote = quoteCanonicalModelPrice(
      model,
      {
        purpose: "request",
        usage: {
          input: 1000,
          videoInputTokens: 2000,
          imageCache: 3000,
          search: 2,
          codeExecution: 3,
        },
      },
      { currency: "USD" },
    )
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBeCloseTo(0.1815, 10)
    expect(model.pricingPlan?.source.hasUnpricedCharges).not.toBe(true)
    expect(browseDiagnostics(model).summary.attention).toBe(0)
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
    expect(
      quoteCanonicalModelPrice(
        model,
        { purpose: "request", usage: { input: 1000 } },
        { currency: "USD" },
      ).status,
    ).not.toBe("complete")
  })
  it("does not invent an endpoint conflict when identical threshold schedules repeat omitted base input rates", async () => {
    const input = {
      type: chargeTypes.Charge,
      name: pricingUnits.Token,
      content: pricingContents.Text,
      origin: pricingOrigins.Provided,
      phase: "inference",
      price: 2,
      per: 1000000,
      variable: false,
    }
    const output = { ...input, origin: pricingOrigins.Generated, price: 10 }
    const reservation = {
      ...input,
      type: chargeTypes.Hold,
      name: "credit",
      phase: "prepare",
      price: 1,
      per: 1,
    }
    const thresholds = [
      { from: 0, units: [reservation, input, output] },
      {
        from: 100000,
        units: [
          { ...input, price: 4 },
          { ...output, price: 15 },
        ],
      },
    ]
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [endpointTypes.Chat, endpointTypes.Responses].map(
            (type, index) => ({
              id: "tiered/model",
              info: { name: "Tiered", developer: "Provider" },
              type,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: index ? [output] : [input, output],
                thresholds,
                dimensions: [],
                variants: [],
              },
            }),
          ),
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    expect(
      model.pricingPlan?.issues?.some(
        (issue) => issue.reason === "source-conflict",
      ),
    ).toBe(false)
    expect(model.pricingPlan?.rates.input?.amount).toBe(2)
    expect(model.pricingPlan?.source.rulesUnavailable).toBe(true)
    expect(
      quoteCanonicalModelPrice(
        model,
        { purpose: "request", usage: { input: 200000, output: 1000 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "unavailable", amount: null })
    expect(browseDiagnostics(model).summary.attention).toBe(1)
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })
  it.each([
    {
      kind: pricingKinds.Fixed,
      currency: "USD",
      units: [
        {
          type: chargeTypes.Charge,
          name: pricingUnits.Token,
          content: pricingContents.Text,
          origin: pricingOrigins.Provided,
          price: 2,
          per: 1000000,
          variable: false,
        },
      ],
      dimensions: ["future-selector"],
    },
    {
      kind: pricingKinds.Variants,
      currency: "USD",
      units: [
        {
          type: chargeTypes.Charge,
          name: pricingUnits.Second,
          content: pricingContents.Video,
          price: null,
          per: 1,
          variable: true,
        },
      ],
      dimensions: ["resolution", "future-selector"],
      variants: [
        { when: { resolution: "720p" }, price: 0.2, per: 1, unit: "second" },
      ],
    },
    {
      kind: pricingKinds.Fixed,
      currency: "USD",
      units: [
        {
          type: chargeTypes.Charge,
          name: pricingUnits.Token,
          content: pricingContents.Text,
          origin: pricingOrigins.Provided,
          price: 2,
          variable: false,
        },
      ],
    },
    {
      kind: pricingKinds.Fixed,
      currency: "USD",
      units: [
        {
          type: chargeTypes.Charge,
          name: pricingUnits.Token,
          content: pricingContents.Text,
          origin: pricingOrigins.Provided,
          price: -2,
          per: 1,
          variable: false,
        },
      ],
    },
    { kind: "future-contract", currency: "USD", units: [] },
    {
      kind: pricingKinds.Variants,
      currency: "USD",
      units: [
        {
          type: chargeTypes.Charge,
          name: pricingUnits.Second,
          content: pricingContents.Video,
          price: null,
          per: 1,
          variable: true,
        },
      ],
      dimensions: ["future-selector"],
      variants: [
        {
          when: { "future-selector": "x" },
          price: 0.2,
          per: 1,
          unit: "second",
        },
      ],
    },
    {
      kind: pricingKinds.Variants,
      currency: "USD",
      units: [
        {
          type: chargeTypes.Charge,
          name: pricingUnits.Second,
          content: pricingContents.Video,
          price: null,
          per: 1,
          variable: true,
        },
      ],
      dimensions: ["resolution"],
      variants: [
        { when: { resolution: "720p" }, price: 0.2, per: 1, unit: "second" },
        { when: { resolution: "720P" }, price: 0.3, per: 1, unit: "second" },
      ],
    },
  ])(
    "fails closed for invalid or ambiguous explicit API pricing without falling back to unrelated HTML: $kind",
    async (pricing) => {
      let htmlReads = 0
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () =>
          HttpResponse.json({
            data: [
              {
                id: "invalid/model",
                info: { name: "Invalid", developer: "Provider" },
                type: endpointTypes.VideoGeneration,
                pricing,
              },
            ],
          }),
        ),
        http.get(pricingUrl, () => {
          htmlReads++
          return HttpResponse.text(table(row("invalid/model")))
        }),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      expect(
        quoteCanonicalModelPrice(
          result.data[0]!,
          {
            purpose: "request",
            videoQuality: "720p",
            usage: { input: 1000, videoSeconds: 2 },
          },
          { currency: "USD" },
        ),
      ).toMatchObject({ status: "unavailable", amount: null })
      expect(htmlReads).toBe(0)
      expect(
        isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI),
      ).toBe(true)
    },
  )
  it("quotes video-token variants with their original denominator and selected input mode", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "video/tokens",
              info: { name: "Video tokens", developer: "Provider" },
              type: endpointTypes.VideoGeneration,
              pricing: {
                kind: pricingKinds.Variants,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Video,
                    origin: pricingOrigins.Generated,
                    price: null,
                    per: 1000000,
                    variable: true,
                  },
                ],
                dimensions: ["video_url"],
                variants: [
                  {
                    when: { video_url: true },
                    price: 6.4,
                    unit: "token",
                    per: 1000000,
                  },
                  {
                    when: { video_url: null },
                    price: 10.7,
                    unit: "token",
                    per: 1000000,
                  },
                ],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(
      quoteCanonicalModelPrice(
        result.data[0]!,
        {
          purpose: "request",
          videoInput: "with-video",
          usage: { videoOutput: 100000 },
        },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "complete", amount: 0.64 })
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it("recognizes a redundant unconditional variant agreeing exactly with its fixed charge", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "redundant/model",
              info: { name: "Redundant", developer: "Provider" },
              type: endpointTypes.VideoGeneration,
              pricing: {
                kind: pricingKinds.Variants,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Generation,
                    content: pricingContents.Video,
                    price: 0.43,
                    per: 1,
                    variable: false,
                  },
                ],
                dimensions: [],
                variants: [
                  { when: {}, price: 0.43, unit: "generation", per: 1 },
                ],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(
      quoteCanonicalModelPrice(
        result.data[0]!,
        { purpose: "request", usage: { request: 2 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "complete", amount: 0.86 })
  })
  it("does not merge batch status or cancellation prices into an interactive inference quotation", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            endpointTypes.Batches,
            endpointTypes.BatchStatus,
            endpointTypes.BatchCancel,
            endpointTypes.Messages,
          ].map((type, index) => ({
            id: "interactive/model",
            info: { name: "Interactive", developer: "Provider" },
            type,
            pricing: {
              kind: pricingKinds.Fixed,
              currency: "USD",
              units: [
                {
                  type: chargeTypes.Charge,
                  name: pricingUnits.Token,
                  content: pricingContents.Text,
                  origin: pricingOrigins.Provided,
                  price: index === 3 ? 2 : 1,
                  per: 1000000,
                  variable: false,
                },
              ],
            },
          })),
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(
      quoteCanonicalModelPrice(
        result.data[0]!,
        { purpose: "request", usage: { input: 1000 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "complete", amount: 0.002 })
    expect(result.data[0]!.supported_endpoint_types).toContain("anthropic")
  })
  it("preserves structured quotes alongside models whose API price is missing", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "structured/model",
              info: { name: "Structured", developer: "Provider" },
              type: endpointTypes.Chat,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Text,
                    origin: pricingOrigins.Provided,
                    price: 2,
                    per: 1000000,
                    variable: false,
                  },
                ],
              },
            },
            {
              id: "legacy/model",
              info: { name: "Legacy", developer: "Provider" },
              type: endpointTypes.Chat,
            },
          ],
        }),
      ),
      http.get(pricingUrl, () => new HttpResponse(null, { status: 503 })),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(
      quoteCanonicalModelPrice(
        result.data.find((m) => m.model_name === "structured/model")!,
        { purpose: "request", usage: { input: 1000 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "complete", amount: 0.002 })
    expect(
      result.data.find((m) => m.model_name === "legacy/model")!.price_metadata
        ?.unavailable_reason,
    ).toBe("official-price-missing")
  })

  it("refuses contradictory structured rates across endpoint rows for the same model id", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [2, 3].map((price, index) => ({
            id: "conflict/model",
            info: { name: "Conflict", developer: "Provider" },
            type: index ? endpointTypes.Responses : endpointTypes.Chat,
            pricing: {
              kind: pricingKinds.Fixed,
              currency: "USD",
              units: [
                {
                  type: chargeTypes.Charge,
                  name: pricingUnits.Token,
                  content: pricingContents.Text,
                  origin: pricingOrigins.Provided,
                  price,
                  per: 1000000,
                  variable: false,
                },
              ],
            },
          })),
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(
      quoteCanonicalModelPrice(
        result.data[0]!,
        { purpose: "request", usage: { input: 1000 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "unavailable", amount: null })
    expect(result.data[0]!.pricingPlan?.issues).toContainEqual({
      code: "unsupported-rule",
      reason: "source-conflict",
    })
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })
  it("does not drop independent variable credit charges from a video variant quotation", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "credits/model",
              info: { name: "Credit video", developer: "Provider" },
              type: endpointTypes.VideoGeneration,
              pricing: {
                kind: pricingKinds.Variants,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Second,
                    content: pricingContents.Video,
                    price: null,
                    per: 1,
                    variable: true,
                  },
                  {
                    type: chargeTypes.Charge,
                    name: "credit",
                    content: "structured",
                    price: null,
                    per: 1,
                    variable: true,
                  },
                ],
                dimensions: ["resolution"],
                variants: [
                  {
                    when: { resolution: "720p" },
                    price: 0.2,
                    per: 1,
                    unit: "second",
                  },
                ],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(
      quoteCanonicalModelPrice(
        result.data[0]!,
        {
          purpose: "request",
          videoQuality: "720p",
          usage: { videoSeconds: 2 },
        },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "partial", amount: 0.4 })
    expect(result.data[0]!.pricingPlan?.source.notes).toContainEqual(
      expect.objectContaining({
        kind: noteKinds.EXCLUDED_CHARGES,
        charges: expect.arrayContaining([expect.stringContaining("credit")]),
      }),
    )
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it("explains runtime-dependent charges without calling the available source missing or quoting its reference rate as fixed", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "variable/model",
              info: { name: "Variable image", developer: "Provider" },
              type: endpointTypes.ImageGeneration,
              pricing: {
                kind: pricingKinds.Variable,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Megapixel,
                    content: pricingContents.Image,
                    price: 0.02,
                    per: 1,
                    variable: true,
                  },
                ],
                thresholds: [],
                dimensions: [],
                variants: [],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(result.data[0]!.pricingPlan?.rates.outputMegapixels?.amount).toBe(
      0.02,
    )
    expect(result.data[0]!.pricingPlan?.source.notes).toEqual([
      { kind: noteKinds.RUNTIME_DEPENDENT },
    ])
    expect(
      quoteCanonicalModelPrice(
        result.data[0]!,
        { purpose: "request", usage: { outputMegapixels: 2 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "unavailable", amount: null })
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })
  it.each([
    {
      type: endpointTypes.ImageGeneration,
      when: { resolution: "1.5k", quality: "low" },
      scenario: { imageSize: "1.5k", imageQuality: "low" },
      unit: "generation",
      usage: { image: 2 },
    },
    {
      type: endpointTypes.ImageGeneration,
      when: { output_tier: "hd" },
      scenario: { imageQuality: "hd" },
      unit: "generation",
      usage: { image: 2 },
    },
    {
      type: endpointTypes.ImageGeneration,
      when: { type: "image_edit" },
      scenario: { generationMode: "image_edit" },
      unit: "generation",
      usage: { image: 2 },
    },
    {
      type: endpointTypes.ImageGeneration,
      when: { megapixels: 2 },
      scenario: { imageMegapixels: 2 },
      unit: "generation",
      usage: { image: 2 },
    },
    {
      type: endpointTypes.VideoGeneration,
      when: {},
      scenario: {},
      unit: "second",
      usage: { videoSeconds: 2 },
    },
    {
      type: endpointTypes.VideoGeneration,
      when: {},
      scenario: {},
      unit: "generation",
      usage: { request: 2 },
    },
  ] as const)(
    "quotes declared image and unconditional variants: $when $unit",
    async ({ type, when, scenario, unit, usage }) => {
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () =>
          HttpResponse.json({
            data: [
              {
                id: "variants/model",
                info: { name: "Variants model", developer: "Provider" },
                type,
                pricing: {
                  kind: pricingKinds.Variants,
                  currency: "USD",
                  units: [
                    {
                      type: chargeTypes.Charge,
                      name: type.includes("video") ? "second" : "generation",
                      content: type.includes("video") ? "video" : "image",
                      price: null,
                      per: 1,
                      variable: true,
                    },
                    {
                      type: chargeTypes.Charge,
                      name: pricingUnits.Generation,
                      content: type.includes("video") ? "video" : "image",
                      price: 0,
                      per: 1,
                      variable: false,
                    },
                  ],
                  dimensions: Object.keys(when),
                  variants: [{ when, price: 0.2, per: 1, unit }],
                },
              },
            ],
          }),
        ),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      expect(
        quoteCanonicalModelPrice(
          result.data[0]!,
          { purpose: "request", ...scenario, usage },
          { currency: "USD" },
        ),
      ).toMatchObject({ status: "complete", amount: 0.4 })
      if ("megapixels" in when)
        expect(
          quoteCanonicalModelPrice(
            result.data[0]!,
            { purpose: "request", imageMegapixels: 3, usage },
            { currency: "USD" },
          ),
        ).toMatchObject({ status: "unavailable", amount: null })
      expect(
        isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI),
      ).toBe(true)
    },
  )
  it("preserves known token rates as a partial quote when distinct tool charges have no shared usage meter", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "tools/model",
              info: { name: "Tools model", developer: "Provider" },
              type: endpointTypes.Chat,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Text,
                    origin: pricingOrigins.Provided,
                    phase: "inference",
                    price: 2,
                    per: 1000000,
                    variable: false,
                  },
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Call,
                    content: "structured",
                    origin: pricingOrigins.Generated,
                    price: 0.01,
                    per: 1,
                    variable: false,
                    tag: { type: "tool", name: "future_tool" },
                  },
                ],
                thresholds: [],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(
      quoteCanonicalModelPrice(
        result.data[0]!,
        { purpose: "request", usage: { input: 1000 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "partial", amount: 0.002 })
    expect(result.data[0]!.pricingPlan?.source).toMatchObject({
      hasUnpricedCharges: true,
    })
    expect(result.data[0]!.pricingPlan?.source.notes).toContainEqual(
      expect.objectContaining({
        kind: noteKinds.EXCLUDED_CHARGES,
        charges: expect.arrayContaining(["future_tool"]),
      }),
    )
    expect(browseDiagnostics(result.data[0]!).summary.attention).toBe(1)
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })
  it("does not silently quote the base rate when the API declares thresholds with no verified selection basis", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "threshold/model",
              info: { name: "Tiered model", developer: "Provider" },
              type: endpointTypes.Chat,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Text,
                    origin: pricingOrigins.Provided,
                    phase: "inference",
                    price: 2,
                    per: 1000000,
                    variable: false,
                  },
                ],
                thresholds: [
                  {
                    from: 200000,
                    units: [
                      {
                        type: chargeTypes.Charge,
                        name: pricingUnits.Token,
                        content: pricingContents.Text,
                        origin: pricingOrigins.Provided,
                        price: 4,
                        per: 1000000,
                        variable: false,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(
      quoteCanonicalModelPrice(
        result.data[0]!,
        { purpose: "request", usage: { input: 250000 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "unavailable", amount: null })
    expect(result.data[0]!.pricingPlan?.source.notes).toEqual([
      { kind: noteKinds.THRESHOLD_BASIS_UNVERIFIED },
    ])
    expect(browseDiagnostics(result.data[0]!).summary.attention).toBe(1)
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it("adds structured prompt and image-token charges to per-image output charges without dropping either meter", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "image/mixed",
              info: { name: "Mixed image model", developer: "Provider" },
              type: endpointTypes.ImageGeneration,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Text,
                    origin: pricingOrigins.Provided,
                    phase: "inference",
                    author: "user",
                    price: 2,
                    per: 1000000,
                    variable: false,
                  },
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Image,
                    origin: pricingOrigins.Provided,
                    phase: "inference",
                    author: "model",
                    price: 4,
                    per: 1000000,
                    variable: false,
                  },
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Generation,
                    content: pricingContents.Image,
                    origin: pricingOrigins.Generated,
                    phase: "inference",
                    author: "model",
                    price: 0.05,
                    per: 1,
                    variable: false,
                  },
                ],
                thresholds: [],
                dimensions: [],
                variants: [],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const quote = quoteCanonicalModelPrice(
      result.data[0]!,
      {
        purpose: "request",
        usage: { input: 1000, imageInput: 2000, image: 2 },
      },
      { currency: "USD" },
    )
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBeCloseTo(0.11, 10)
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it.each([
    { key: "max_resolution", value: 1080, scenario: { videoQuality: "1080p" } },
    {
      key: "parameters.resolution",
      value: "480P",
      scenario: { videoQuality: "480p" },
    },
    { key: "sound", value: "on", scenario: { videoAudio: "with-audio" } },
    {
      key: "parameters.audio",
      value: false,
      scenario: { videoAudio: "without-audio" },
    },
    { key: "video_url", value: true, scenario: { videoInput: "with-video" } },
    {
      key: "video_url",
      value: null,
      scenario: { videoInput: "without-video" },
    },
    { key: "mode", value: "pro", scenario: { videoMode: "pro" } },
    {
      key: "type",
      value: "video_edit",
      scenario: { generationMode: "video_edit" },
    },
    {
      key: "hdr",
      value: true,
      scenario: { videoDynamicRange: PRICING_VIDEO_DYNAMIC_RANGES.HDR },
    },
  ] as const)(
    "maps the declared $key variant to a shared workload condition",
    async ({ key, value, scenario }) => {
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () =>
          HttpResponse.json({
            data: [
              {
                id: "condition/model",
                info: { name: "Condition model", developer: "Provider" },
                type: endpointTypes.VideoGeneration,
                pricing: {
                  kind: pricingKinds.Variants,
                  currency: "USD",
                  units: [
                    {
                      type: chargeTypes.Charge,
                      name: pricingUnits.Second,
                      content: pricingContents.Video,
                      price: null,
                      per: 1,
                      variable: true,
                    },
                  ],
                  dimensions: [key],
                  variants: [
                    {
                      when: { [key]: value },
                      price: 0.2,
                      unit: "second",
                      per: 1,
                    },
                  ],
                },
              },
            ],
          }),
        ),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      const model = result.data[0]!
      const quote = quoteCanonicalModelPrice(
        model,
        { purpose: "request", ...scenario, usage: { videoSeconds: 2 } },
        { currency: "USD" },
      )
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(0.4, 10)
      expect(
        quoteCanonicalModelPrice(
          model,
          { purpose: "request", usage: { videoSeconds: 2 } },
          { currency: "USD" },
        ),
      ).toMatchObject({ status: "unavailable", amount: null })
      expect(
        isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI),
      ).toBe(true)
    },
  )

  it("quotes total generation prices only at their declared video durations, without interpolation", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "duration/model",
              info: { name: "Duration model", developer: "Provider" },
              type: endpointTypes.VideoGeneration,
              pricing: {
                kind: pricingKinds.Variants,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: "resolution",
                    content: pricingContents.Video,
                    price: null,
                    per: 1,
                    variable: true,
                  },
                ],
                dimensions: ["resolution", "duration"],
                variants: [
                  {
                    when: { resolution: "720p", duration: 6 },
                    price: 0.28,
                    unit: "generation",
                    per: 1,
                  },
                  {
                    when: { resolution: "720p", duration: "10s" },
                    price: 0.56,
                    unit: "generation",
                    per: 1,
                  },
                ],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    for (const [seconds, amount] of [
      [6, 0.28],
      [10, 0.56],
    ] as const) {
      const quote = quoteCanonicalModelPrice(
        model,
        {
          purpose: "request",
          videoQuality: "720p",
          usage: { videoSeconds: seconds },
        },
        { currency: "USD" },
      )
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(amount, 10)
    }
    expect(
      quoteCanonicalModelPrice(
        model,
        {
          purpose: "request",
          videoQuality: "720p",
          usage: { videoSeconds: 8 },
        },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "unavailable", amount: null })
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it("quotes annotated and plain OCR output as distinct declared page prices", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "mistral/mistral-ocr-latest",
              info: { name: "Mistral OCR", developer: "Mistral AI" },
              type: endpointTypes.Ocr,
              pricing: {
                kind: pricingKinds.Variants,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Page,
                    content: pricingContents.Document,
                    price: null,
                    per: 1,
                    variable: true,
                  },
                ],
                dimensions: ["annotated"],
                variants: [
                  {
                    when: { annotated: false },
                    price: 0.004,
                    unit: "page",
                    per: 1,
                  },
                  {
                    when: { annotated: true },
                    price: 0.005,
                    unit: "page",
                    per: 1,
                  },
                ],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    for (const [documentAnnotation, amount] of [
      [PRICING_DOCUMENT_ANNOTATIONS.PLAIN, 0.04],
      [PRICING_DOCUMENT_ANNOTATIONS.ANNOTATED, 0.05],
    ] as const) {
      const quote = quoteCanonicalModelPrice(
        model,
        { purpose: "request", documentAnnotation, usage: { pages: 10 } },
        { currency: "USD" },
      )
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(amount, 10)
    }
    expect(
      quoteCanonicalModelPrice(
        model,
        { purpose: "request", usage: { pages: 10 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "unavailable", amount: null })
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it("quotes the official resolution/audio variant matrix without inheriting contradictory HTML rates or defaulting missing selectors", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "google/veo-3.1-lite-generate-001",
              info: { name: "Veo Lite", developer: "Google" },
              type: endpointTypes.VideoGeneration,
              pricing: {
                kind: pricingKinds.Variants,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Second,
                    content: pricingContents.Video,
                    price: null,
                    per: 1,
                    variable: true,
                  },
                ],
                thresholds: [],
                dimensions: ["resolution", "generate_audio"],
                variants: [
                  {
                    when: { resolution: "720p", generate_audio: false },
                    price: 0.03,
                    unit: "second",
                    per: 1,
                  },
                  {
                    when: { resolution: "720p", generate_audio: true },
                    price: 0.05,
                    unit: "second",
                    per: 1,
                  },
                  {
                    when: { resolution: "1080p", generate_audio: false },
                    price: 0.05,
                    unit: "second",
                    per: 1,
                  },
                  {
                    when: { resolution: "1080p", generate_audio: true },
                    price: 0.084,
                    unit: "second",
                    per: 1,
                  },
                ],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    const quote = quoteCanonicalModelPrice(
      model,
      {
        purpose: "request",
        videoQuality: "1080p",
        videoAudio: "with-audio",
        usage: { videoSeconds: 5 },
      },
      { currency: "USD" },
    )
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBeCloseTo(0.42, 10)
    expect(model.price_metadata?.precision).toBe("exact")
    expect(
      quoteCanonicalModelPrice(
        model,
        { purpose: "request", usage: { videoSeconds: 5 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "unavailable", amount: null })
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it("keeps provider-reported listed-token pricing as an explicit estimate rather than a fixed quotation", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "reported/model",
              info: { name: "Reported model", developer: "Provider" },
              type: endpointTypes.Chat,
              pricing: {
                kind: pricingKinds.Variable,
                currency: "USD",
                billing: {
                  source: "provider-reported",
                  fallback: "listed-token-estimate",
                },
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Text,
                    origin: pricingOrigins.Provided,
                    phase: "inference",
                    author: "user",
                    price: 2,
                    per: 1000000,
                    variable: false,
                  },
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Token,
                    content: pricingContents.Text,
                    origin: pricingOrigins.Generated,
                    phase: "inference",
                    author: "model",
                    price: 10,
                    per: 1000000,
                    variable: false,
                  },
                ],
                thresholds: [],
                dimensions: [],
                variants: [],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    const quote = quoteCanonicalModelPrice(
      model,
      { purpose: "request", usage: { input: 1000, output: 1000 } },
      { currency: "USD" },
    )
    expect(quote.status).toBe("partial")
    expect(quote.amount).toBeCloseTo(0.012, 10)
    expect(model.price_metadata?.precision).toBe("estimated")
    // A supported upstream estimate is not an unrecognized task-billing rule.
    // The actual request quotation must still remain partial above.
    expect(browseDiagnostics(model).summary.attention).toBe(0)
    expect(model.pricingPlan?.source.notes).toEqual([
      { kind: noteKinds.PROVIDER_REPORTED_ESTIMATE },
    ])
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it.each([
    {
      name: pricingUnits.Second,
      content: pricingContents.Video,
      price: 0.13,
      per: 1,
      usage: { videoSeconds: 5 },
      amount: 0.65,
    },
    {
      name: pricingUnits.Token,
      content: pricingContents.Video,
      price: 10,
      per: 1000,
      usage: { videoOutput: 2000 },
      amount: 20,
    },
    {
      name: pricingUnits.Generation,
      content: pricingContents.Image,
      price: 0.04,
      per: 1,
      usage: { request: 2 },
      amount: 0.08,
    },
    {
      name: pricingUnits.Page,
      content: pricingContents.Document,
      price: 0.004,
      per: 1,
      usage: { pages: 3 },
      amount: 0.012,
    },
    {
      name: pricingUnits.Megapixel,
      content: pricingContents.Image,
      price: 0.03,
      per: 1,
      usage: { outputMegapixels: 2.5 },
      amount: 0.075,
    },
  ])(
    "quotes fixed structured $content $name charges in their original units",
    async ({ name, content, price, per, usage, amount }) => {
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () =>
          HttpResponse.json({
            data: [
              {
                id: "metered/model",
                info: { name: "Metered model", developer: "Provider" },
                type: endpointTypes.VideoGeneration,
                pricing: {
                  kind: pricingKinds.Fixed,
                  currency: "USD",
                  units: [
                    {
                      type: chargeTypes.Charge,
                      name,
                      content,
                      measure: "output",
                      origin: pricingOrigins.Generated,
                      phase: "inference",
                      author: "model",
                      price,
                      per,
                      variable: false,
                    },
                  ],
                  thresholds: [],
                  dimensions: [],
                  variants: [],
                },
              },
            ],
          }),
        ),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      const quote = quoteCanonicalModelPrice(
        result.data[0]!,
        { purpose: "request", usage },
        { currency: "USD" },
      )
      expect(quote.status).toBe("complete")
      expect(quote.amount).toBeCloseTo(amount, 10)
      expect(
        isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI),
      ).toBe(true)
    },
  )

  it.each([
    [undefined, undefined],
    [undefined, "inference"],
    ["inference", undefined],
    ["", "inference"],
    ["inference", "inference"],
  ])(
    "does not merge output charges without distinct declared phases (%s, %s)",
    async (firstPhase, secondPhase) => {
      const output = {
        type: chargeTypes.Charge,
        name: pricingUnits.Token,
        content: pricingContents.Text,
        origin: pricingOrigins.Generated,
        price: 10,
        per: 1000000,
        variable: false,
      }
      server.use(
        http.get("https://api.aimlapi.com/v1/models", () =>
          HttpResponse.json({
            data: [
              {
                id: "ambiguous-output",
                info: { name: "Ambiguous output", developer: "Provider" },
                type: endpointTypes.Chat,
                pricing: {
                  kind: pricingKinds.Fixed,
                  currency: "USD",
                  units: [
                    { ...output, phase: firstPhase },
                    { ...output, phase: secondPhase },
                  ],
                },
              },
            ],
          }),
        ),
      )
      const result = await aimlApiProviderModelCatalog.fetchPricing({})
      const model = result.data[0]!
      expect(model.pricingPlan?.source.rulesUnavailable).toBe(true)
      expect(model.pricingPlan?.rates.output).toBeUndefined()
      expect(model.pricingPlan?.source.pricingDescription).toBeUndefined()
      expect(model.pricingPlan?.source.notes).toContainEqual({
        kind: "ambiguous-charges",
      })
      expect(
        quoteCanonicalModelPrice(
          model,
          {
            purpose: "request",
            usage: { output: 1000 },
          },
          { currency: "USD" },
        ).status,
      ).not.toBe("complete")
    },
  )

  it("preserves structured token denominators, cache origins and equal reasoning rates without charging output twice", async () => {
    const unit = (
      origin: string,
      price: number,
      per = 1000,
      phase = "inference",
    ) => ({
      type: chargeTypes.Charge,
      name: pricingUnits.Token,
      content: pricingContents.Text,
      measure: "output",
      origin,
      phase,
      author: origin === "generated" ? "model" : "user",
      price,
      per,
      variable: false,
    })
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "token/model",
              info: { name: "Token model", developer: "Provider" },
              type: endpointTypes.Chat,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: [
                  unit(pricingOrigins.Provided, 0.002),
                  unit(pricingOrigins.Generated, 0.01),
                  unit(pricingOrigins.Generated, 10, 1000000, "reasoning"),
                  unit(pricingOrigins.Cached, 0.0002),
                  unit(pricingOrigins.CacheWrite, 0.0025),
                  unit(pricingOrigins.CacheWrite1h, 0.004),
                ],
                thresholds: [],
                dimensions: [],
                variants: [],
              },
            },
          ],
        }),
      ),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    expect(model.token_price_usd_per_million).toMatchObject({
      input: 2,
      output: 10,
      cache_read: 0.2,
    })
    const quote = quoteCanonicalModelPrice(
      model,
      {
        purpose: "request",
        usage: {
          input: 1000,
          output: 10000,
          cacheRead: 500,
          cacheWrite: 0,
          cacheWrite1h: 0,
        },
      },
      { currency: "USD" },
    )
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBeCloseTo(0.1021, 10)
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
  })

  it("uses opt-in runtime pricing as the authoritative source without requesting any pricing HTML", async () => {
    let htmlReads = 0
    server.use(
      http.get("https://api.aimlapi.com/v1/models", ({ request }) => {
        expect(new URL(request.url).searchParams.get("include")).toBe("pricing")
        expect(request.headers.has("authorization")).toBe(false)
        return HttpResponse.json({
          data: [
            {
              id: "elevenlabs/scribe_v2",
              info: { name: "Scribe v2", developer: "ElevenLabs" },
              type: endpointTypes.SpeechToText,
              pricing: {
                kind: pricingKinds.Fixed,
                currency: "USD",
                units: [
                  {
                    type: chargeTypes.Charge,
                    name: pricingUnits.Second,
                    content: pricingContents.Audio,
                    measure: "computation",
                    origin: pricingOrigins.Generated,
                    phase: "inference",
                    author: "model",
                    price: 0.000061111,
                    per: 1,
                    variable: false,
                  },
                ],
                thresholds: [],
                dimensions: [],
                variants: [],
                variable: false,
              },
            },
          ],
        })
      }),
      http.get("https://aimlapi.com/*", () => {
        htmlReads++
        return HttpResponse.html("Contradictory obsolete HTML")
      }),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    const model = result.data[0]!
    expect(
      quoteCanonicalModelPrice(
        model,
        { purpose: "request", usage: { audio: 60 } },
        { currency: "USD" },
      ),
    ).toMatchObject({ status: "complete" })
    expect(model.pricingPlan?.rates.audio).toMatchObject({
      amount: 0.000061111,
      per: 1,
      unit: "second",
    })
    expect(model.price_metadata?.precision).toBe("exact")
    expect(isValidProviderModelCatalogPricing(result, SITE_TYPES.AIMLAPI)).toBe(
      true,
    )
    expect(htmlReads).toBe(0)
  })

  it("preserves the official readable name separately from the request model id", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "anthropic/claude-haiku-5-5",
              info: { name: "Claude Haiku 5.5", developer: "Anthropic" },
              type: endpointTypes.Messages,
            },
          ],
        }),
      ),
      http.get(pricingUrl, () => HttpResponse.html(table(""))),
    )
    const result = await aimlApiProviderModelCatalog.fetchPricing({})
    expect(result.data[0]).toMatchObject({
      model_name: "anthropic/claude-haiku-5-5",
      display_name: "Claude Haiku 5.5",
    })
  })

  it("propagates cancellation instead of silently returning unpriced models", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      aimlApiProviderModelCatalog.fetchPricing({
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("preserves an empty catalog and does not turn model fetch errors into success", async () => {
    mockCatalog([])
    server.use(
      http.get(pricingUrl, () => HttpResponse.html("<html>Unavailable</html>")),
    )
    expect((await aimlApiProviderModelCatalog.fetchPricing({})).data).toEqual(
      [],
    )
    server.use(
      http.get(
        "https://api.aimlapi.com/v1/models",
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    await expect(aimlApiProviderModelCatalog.fetchPricing({})).rejects.toThrow()
  })
})
