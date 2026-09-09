import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  OPENROUTER_API_BASE_URL,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import { openRouterProviderModelCatalog } from "~/services/apiAdapters/openrouter/providerModelCatalog"
import * as personalizedModelCatalogService from "~/services/apiService/openrouter/personalizedModelCatalog"
import * as publicModelCatalogService from "~/services/apiService/openrouter/publicModelCatalog"
import { ApiError } from "~/services/apiTransport/errors"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import { PRICING_PURPOSES } from "~/services/modelPricing/pricingConstants"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import {
  MODEL_DISPLAY_FACT_LABELS,
  MODEL_DISPLAY_FACT_TYPES,
} from "~/services/models/modelDisplayFacts"
import { server } from "~~/tests/msw/server"

function getSection(
  model: Awaited<
    ReturnType<typeof openRouterProviderModelCatalog.fetchPricing>
  >["data"][number],
  id: string,
) {
  const section = model.presentation?.sections?.find(
    (candidate) => candidate.id === id,
  )
  expect(section, `Expected ${id} section`).toBeDefined()
  return section!
}

it("quotes published image and audio token rates in token units", async () => {
  server.use(
    http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
      HttpResponse.json({
        data: [
          {
            id: "test/media",
            pricing: {
              prompt: "0.000001",
              completion: "0.000002",
              image_token: "0.000003",
              audio: "0.000004",
              audio_output: "0.000005",
              request: "0",
            },
          },
        ],
        total_count: 1,
        links: { next: null },
      }),
    ),
  )
  const model = (await openRouterProviderModelCatalog.fetchPricing({})).data[0]
  expect(model.pricingPlan?.source.url).toBe("https://openrouter.ai/test/media")
  expect(
    quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.REQUEST,
        usage: {
          input: 1000,
          output: 1000,
          imageInput: 1000,
          audioInput: 1000,
          audioOutput: 1000,
          request: 1,
        },
      },
      {},
    ).amount,
  ).toBeCloseTo(0.015)
})

it("enforces the published 8192 total and 4096 output limits independently", async () => {
  server.use(
    http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
      HttpResponse.json({
        data: [
          {
            id: "tencent/hy-mt2-1.8b",
            context_length: 8192,
            top_provider: { context_length: 8192, max_completion_tokens: 4096 },
            pricing: { prompt: "0.000000044", completion: "0.000000177" },
          },
        ],
        total_count: 1,
        links: { next: null },
      }),
    ),
  )
  const model = (await openRouterProviderModelCatalog.fetchPricing({})).data[0]
  const quote = (inputTokens: number, outputTokens: number) =>
    quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.REQUEST,
        inputTokens,
        outputTokens,
        usage: { input: 80, output: 20 },
      },
      {},
    )
  expect(quote(32000, 2000)).toMatchObject({
    status: "unavailable",
    requirementDetails: [
      { axis: "totalTokens", value: 34000, ranges: [{ max: 8192 }] },
    ],
  })
  expect(quote(6000, 2000).status).toBe("complete")
  expect(quote(2000, 5000)).toMatchObject({
    status: "unavailable",
    requirementDetails: [
      { axis: "outputTokens", value: 5000, ranges: [{ max: 4096 }] },
    ],
  })
  const index = quoteCanonicalModelPrice(
    model,
    {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens: 32000,
      outputTokens: 2000,
      usage: { input: 80, output: 20 },
    },
    {},
  )
  expect(index.status).toBe("complete")
  expect(index.amount).toBeCloseTo(0.044 * 0.8 + 0.177 * 0.2)
  expect(index.issues).not.toContainEqual({ code: "model-limit-exceeded" })
})

it("keeps output-image counts and cached audio tokens as separate published meters", async () => {
  server.use(
    http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
      HttpResponse.json({
        data: [
          {
            id: "test/media-details",
            pricing: {
              prompt: "0.000001",
              completion: "0.000002",
              input_audio_cache: "0.000003",
              image_output: "0.1",
              request: "0",
            },
          },
        ],
        total_count: 1,
        links: { next: null },
      }),
    ),
  )
  const model = (await openRouterProviderModelCatalog.fetchPricing({})).data[0]
  const quote = quoteCanonicalModelPrice(
    model,
    {
      purpose: PRICING_PURPOSES.REQUEST,
      usage: {
        input: 1000,
        output: 1000,
        audioCache: 1000,
        outputImage: 2,
        request: 1,
      },
    },
    {},
  )
  expect(quote.status).toBe("complete")
  expect(quote.amount).toBeCloseTo(0.206)
})

function getFact(
  section: ReturnType<typeof getSection>,
  fallbackLabel: string,
) {
  const fact = section.facts.find(
    (candidate) => candidate.label.fallback === fallbackLabel,
  )
  expect(fact, `Expected ${fallbackLabel} fact`).toBeDefined()
  return fact!
}

describe("OpenRouter provider model catalog Adapter", () => {
  beforeEach(() => server.resetHandlers())
  afterEach(() => vi.restoreAllMocks())

  it("normalizes the verified personalized catalog behind an account-authenticated capability", async () => {
    let publicRequestCount = 0
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models/user`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe(
          "Bearer management-key-example",
        )
        return HttpResponse.json({
          data: [
            {
              id: "example/personalized-model",
              name: "Personalized Model",
              pricing: { prompt: "0", completion: "0" },
            },
          ],
          total_count: 1,
          links: { next: null },
        })
      }),
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () => {
        publicRequestCount += 1
        return HttpResponse.json({
          data: [],
          total_count: 0,
          links: { next: null },
        })
      }),
    )

    const response =
      await openRouterProviderModelCatalog.personalized!.fetchPricing({
        accountId: "account-example-a",
        credential: "management-key-example",
      })

    expect(response.data).toEqual([
      expect.objectContaining({
        model_name: "example/personalized-model",
        display_name: "Personalized Model",
      }),
    ])
    expect(response.model_list_source.catalogScope).toBe(
      MODEL_CATALOG_SCOPES.PERSONALIZED,
    )
    expect(publicRequestCount).toBe(0)
  })

  it("redacts the Management Key when personalized provider errors are disclosed", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models/user`, () =>
        HttpResponse.json(
          {
            error: {
              code: 403,
              message:
                "Management key management-key-example cannot access the catalog",
            },
          },
          { status: 403 },
        ),
      ),
    )

    const error = await openRouterProviderModelCatalog
      .personalized!.fetchPricing({
        accountId: "account-example-a",
        credential: "management-key-example",
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(
      "Management key [REDACTED] cannot access the catalog",
    )
    expect((error as Error).cause).toBeUndefined()
  })

  it("returns a safe abort error when cancellation races a provider rejection", async () => {
    const credential = "management-key-example"
    const controller = new AbortController()
    controller.abort(new Error(`unsafe abort reason ${credential}`))
    vi.spyOn(
      personalizedModelCatalogService,
      "fetchOpenRouterPersonalizedModelCatalog",
    ).mockRejectedValue(
      new ApiError(`Provider rejected ${credential}`, 403, "/models/user"),
    )

    const error = await openRouterProviderModelCatalog
      .personalized!.fetchPricing({
        accountId: "account-example-a",
        credential,
        abortSignal: controller.signal,
      })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      name: "AbortError",
      message: "The operation was aborted",
    })
    expect(JSON.stringify(error)).not.toContain(credential)
    expect((error as Error).message).not.toContain("Provider rejected")
    expect((error as Error).message).not.toContain("unsafe abort reason")
    expect((error as Error).cause).toBeUndefined()
  })

  it("preserves a provider abort error", async () => {
    const abortError = new DOMException("Cancelled", "AbortError")
    vi.spyOn(
      publicModelCatalogService,
      "fetchOpenRouterPublicModelCatalog",
    ).mockRejectedValue(abortError)

    await expect(openRouterProviderModelCatalog.fetchPricing({})).rejects.toBe(
      abortError,
    )
  })

  it.each([
    ["network", new TypeError("Network unavailable"), TypeError],
    ["generic", new Error("Catalog unavailable"), Error],
  ])(
    "preserves the %s error category at the public catalog disclosure boundary",
    async (_label, providerError, expectedType) => {
      vi.spyOn(
        publicModelCatalogService,
        "fetchOpenRouterPublicModelCatalog",
      ).mockRejectedValue(providerError)

      const error = await openRouterProviderModelCatalog
        .fetchPricing({})
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(expectedType)
      expect((error as Error).constructor).toBe(expectedType)
      expect(error).not.toBe(providerError)
      expect((error as Error).message).toBe(providerError.message)
      expect((error as Error).cause).toBeUndefined()
    },
  )

  it("normalizes primary prices and core display facts into the product model", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({
          data: [
            {
              id: "example/model-alpha",
              name: "Model Alpha",
              description: "A catalog model",
              context_length: 128000,
              pricing: {
                prompt: "0.0000015",
                completion: "0",
                input_cache_read: "0.00000025",
              },
              architecture: { output_modalities: ["text", "image"] },
              top_provider: { max_completion_tokens: 8192 },
            },
          ],
          total_count: 1,
          links: { next: null },
        }),
      ),
    )

    const response = await openRouterProviderModelCatalog.fetchPricing({})

    expect(response.data).toHaveLength(1)
    expect(response.data[0]).toMatchObject({
      model_name: "example/model-alpha",
      display_name: "Model Alpha",
      model_description: "A catalog model",
      token_price_usd_per_million: {
        input: 1.5,
        output: 0,
        cache_read: 0.25,
      },
      presentation: {
        summaryFacts: [
          {
            type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
            label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
            value: 128000,
          },
          {
            type: MODEL_DISPLAY_FACT_TYPES.StringList,
            label: MODEL_DISPLAY_FACT_LABELS.OutputModalities,
            values: ["text", "image"],
          },
        ],
      },
    })
    expect(
      getFact(
        getSection(response.data[0]!, "routing"),
        "Maximum output tokens",
      ),
    ).toMatchObject({
      type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
      label: MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
      value: 8192,
    })
    expect(response.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
      provider: SITE_TYPES.OPENROUTER,
      catalogScope: MODEL_CATALOG_SCOPES.PROVIDER,
      supportsRuntimeModelList: false,
      supportsPricing: true,
      actionPolicy: {
        supportsGroupFiltering: false,
        supportsAccountSummary: false,
        supportsTokenCompatibility: false,
        supportsCredentialVerification: false,
        supportsBatchCredentialVerification: false,
        supportsCliVerification: false,
      },
    })
  })

  it("preserves free prices while keeping missing and invalid primary prices unavailable", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({
          data: [
            {
              id: "example/free-model",
              pricing: { prompt: "0", completion: "0" },
            },
            {
              id: "example/missing-price",
              pricing: { prompt: "0.000001" },
            },
            {
              id: "example/negative-price",
              pricing: { prompt: "-0.1", completion: "0.000002" },
              context_length: "128000",
              architecture: { output_modalities: "text" },
              top_provider: { max_completion_tokens: -1 },
            },
            {
              id: "example/non-finite-price",
              pricing: { prompt: "Infinity", completion: "0.000002" },
            },
            {
              id: "example/malformed-pricing",
              pricing: "not-an-object",
            },
            {
              id: "example/mixed-invalid-price",
              pricing: { prompt: null, completion: "-0.1" },
            },
          ],
          total_count: 6,
          links: { next: null },
        }),
      ),
    )

    const response = await openRouterProviderModelCatalog.fetchPricing({})
    const models = Object.fromEntries(
      response.data.map((model) => [model.model_name, model]),
    )

    expect(models["example/free-model"]).toMatchObject({
      token_price_usd_per_million: { input: 0, output: 0 },
      price_metadata: { precision: MODEL_PRICE_PRECISION_KINDS.EXACT },
    })
    expect(models["example/missing-price"]).toMatchObject({
      price_metadata: {
        precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        unavailable_reason:
          MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
      },
    })
    expect(models["example/missing-price"].token_price_usd_per_million).toBe(
      undefined,
    )

    for (const modelId of [
      "example/negative-price",
      "example/non-finite-price",
      "example/malformed-pricing",
      "example/mixed-invalid-price",
    ]) {
      expect(models[modelId]).toMatchObject({
        price_metadata: {
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_INVALID,
        },
      })
      expect(models[modelId].token_price_usd_per_million).toBeUndefined()
    }
    expect(
      models["example/negative-price"].presentation?.sections?.some(
        (section) => section.id === "pricing",
      ),
    ).toBeFalsy()
  })

  it("preserves cache-only prices without claiming comparable primary pricing", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({
          data: [
            {
              id: "example/cache-only-model",
              pricing: {
                input_cache_read: "0.00000025",
                input_cache_write: "0.0000005",
              },
            },
          ],
          total_count: 1,
          links: { next: null },
        }),
      ),
    )

    const response = await openRouterProviderModelCatalog.fetchPricing({})

    expect(response.data[0]).toMatchObject({
      token_price_usd_per_million: {
        cache_read: 0.25,
        cache_write: 0.5,
      },
      price_metadata: {
        precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        unavailable_reason:
          MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
      },
    })
  })

  it("normalizes rich native facts with reviewed ordering, units, and publisher evidence", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({
          data: [
            {
              id: "publisher-example/model-alpha",
              canonical_slug: "publisher-example/model-alpha-stable",
              name: "Model Alpha",
              description: "A catalog model",
              created: 1_704_067_200,
              knowledge_cutoff: "2023-12-31",
              expiration_date: "2026-12-31",
              hugging_face_id: "publisher-example/model-alpha",
              alias_target: {
                name: "Model Alpha Stable",
                slug: "publisher-example/model-alpha-stable",
              },
              context_length: 128_000,
              architecture: {
                input_modalities: ["text", "image", "text"],
                output_modalities: ["text", "audio"],
                modality: "text+image->text+audio",
                tokenizer: "Example tokenizer",
                instruct_type: "example-format",
              },
              pricing: {
                prompt: "0.000001",
                completion: "0.000002",
                request: "0.005",
                image: "0.01",
                image_output: "0.02",
                image_token: "0.0000003",
                audio: "0.0000004",
                audio_output: "0.0000005",
                web_search: "0.006",
                internal_reasoning: "0.0000007",
                input_audio_cache: "0.0000008",
                input_cache_read: "0.0000002",
                input_cache_write: "0.0000009",
                input_cache_write_1h: "0.0000011",
                discount: 0.25,
                overrides: [
                  {
                    min_prompt_tokens: 200_000,
                    prompt: "0.000003",
                    completion: "0.000004",
                  },
                  {
                    utc_start: 1630,
                    utc_end: 30,
                    prompt: "0.0000005",
                    input_cache_read: "0",
                  },
                ],
              },
              top_provider: {
                context_length: 96_000,
                max_completion_tokens: 8_192,
                is_moderated: false,
              },
              per_request_limits: {
                prompt_tokens: 64_000,
                completion_tokens: 4_096,
              },
              supported_parameters: ["temperature", "reasoning", "tools"],
              default_parameters: {
                temperature: 0,
                top_p: 0.9,
                top_k: 40,
                frequency_penalty: -0.2,
                presence_penalty: 0.1,
                repetition_penalty: 1.05,
              },
              reasoning: {
                mandatory: false,
                default_enabled: true,
                default_effort: "medium",
                supported_efforts: ["high", "medium", "low"],
                supports_max_tokens: true,
              },
              supported_voices: ["voice-alpha", "voice-beta"],
              benchmarks: {
                artificial_analysis: {
                  intelligence_index: 71.4,
                  coding_index: 63.2,
                  agentic_index: 55.8,
                },
                design_arena: [
                  {
                    arena: "models",
                    category: "website",
                    elo: 1385.2,
                    win_rate: 62.5,
                    rank: 5,
                  },
                ],
              },
              links: {
                details:
                  "/api/v1/models/publisher-example/model-alpha/endpoints",
              },
              additive_unknown_field: {
                raw_secret: "must-not-reach-presentation",
              },
            },
          ],
          total_count: 1,
          links: { next: null },
        }),
      ),
    )

    const response = await openRouterProviderModelCatalog.fetchPricing({})
    const model = response.data[0]!

    expect(model.vendorEvidence).toEqual({
      kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
      name: "publisher-example",
      externalId: "publisher-example",
    })
    expect(
      model.presentation?.summaryFacts?.map((fact) => fact.label.fallback),
    ).toEqual(["Context limit", "Input modalities", "Output modalities"])
    expect(model.presentation?.sections?.map((section) => section.id)).toEqual([
      "pricing",
      "architecture",
      "capabilities",
      "request-limits",
      "routing",
      "lifecycle",
      "benchmarks",
      "links",
    ])

    const pricing = getSection(model, "pricing")
    expect(
      pricing.facts
        .filter((fact) => fact.type === "currency-price")
        .map((fact) => [
          fact.label.fallback,
          Number(fact.amount.toFixed(8)),
          fact.unit,
        ]),
    ).toEqual([
      ["Reasoning token price", 0.7, "million-reasoning-tokens"],
      ["Image output price", 0.02, "output-image"],
      ["Image token price", 0.3, "million-image-tokens"],
      ["Audio input price", 0.4, "million-audio-input-tokens"],
      ["Audio output price", 0.5, "million-audio-output-tokens"],
      ["Cached audio input price", 0.8, "million-cached-audio-input-tokens"],
    ])
    expect(model.pricingPlan?.rules).toHaveLength(2)
    expect(
      pricing.facts.some((fact) => fact.label.fallback === "Discount"),
    ).toBeFalsy()

    expect(
      getFact(getSection(model, "request-limits"), "Prompt token limit"),
    ).toMatchObject({ type: "token-quantity", value: 64_000 })
    expect(
      getFact(getSection(model, "routing"), "Content moderation"),
    ).toMatchObject({ type: "boolean", value: false })
    expect(
      getFact(getSection(model, "benchmarks"), "Design Arena rankings"),
    ).toMatchObject({
      type: "benchmark-list",
      entries: [
        {
          arena: "models",
          category: "website",
          score: 1385.2,
          rank: 5,
          winRatePercent: 62.5,
        },
      ],
    })
    expect(
      getFact(getSection(model, "links"), "Provider details"),
    ).toMatchObject({
      type: "link",
      href: `${OPENROUTER_API_BASE_URL}/models/publisher-example/model-alpha/endpoints`,
    })
    expect(JSON.stringify(model.presentation)).not.toContain(
      "must-not-reach-presentation",
    )
  })

  it("keeps valid nested facts while omitting malformed optional siblings", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({
          data: [
            {
              id: "publisher-example/model-partial",
              canonical_slug: "invalid publisher/model-partial",
              context_length: 0,
              created: Number.MAX_SAFE_INTEGER,
              knowledge_cutoff: "not-a-date",
              expiration_date: "2026-02-30",
              architecture: {
                input_modalities: ["text", 4, " text "],
                output_modalities: "text",
                tokenizer: "  Example tokenizer  ",
              },
              pricing: {
                prompt: "0",
                completion: "0",
                request: "-1",
                image: "NaN",
                overrides: [
                  { min_prompt_tokens: -1, prompt: "0.000001" },
                  {
                    min_prompt_tokens: 100,
                    prompt: "invalid",
                    completion: "0",
                  },
                  {
                    utc_start: 1260,
                    utc_end: 30,
                    prompt: "0.000001",
                  },
                ],
              },
              top_provider: {
                context_length: 4_096,
                max_completion_tokens: -1,
                is_moderated: "false",
              },
              per_request_limits: {
                prompt_tokens: 0,
                completion_tokens: "4096",
              },
              reasoning: {
                mandatory: false,
                default_effort: " ",
                supported_efforts: ["low", 4, " low "],
              },
              default_parameters: { temperature: "invalid" },
              alias_target: { name: "Stable alias", slug: 4 },
              benchmarks: {
                design_arena: [
                  {
                    arena: "models",
                    category: "website",
                    elo: -1,
                    win_rate: 101,
                    rank: 0,
                  },
                  {
                    arena: "builders",
                    category: "application",
                    elo: 1200,
                    win_rate: 0,
                    rank: 1,
                  },
                ],
              },
              links: {
                details: "https://[",
              },
            },
            {
              id: "publisher-example/model-untrusted-link",
              pricing: { prompt: "0", completion: "0" },
              links: {
                details:
                  "https://catalog.example.invalid/api/v1/models/model/endpoints",
              },
            },
          ],
          total_count: 2,
          links: { next: null },
        }),
      ),
    )

    const response = await openRouterProviderModelCatalog.fetchPricing({})
    const model = response.data[0]!

    expect(model.presentation?.summaryFacts).toEqual([
      {
        type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
        label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
        value: 0,
      },
      expect.objectContaining({
        type: MODEL_DISPLAY_FACT_TYPES.StringList,
        values: ["text"],
      }),
    ])
    expect(
      model.presentation?.sections?.some((section) => section.id === "pricing"),
    ).toBe(false)
    expect(model.pricingPlan?.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conditions: [{ kind: "range", axis: "inputTokens", min: 101 }],
        }),
      ]),
    )
    expect(
      getFact(getSection(model, "request-limits"), "Prompt token limit"),
    ).toMatchObject({ value: 0 })
    expect(
      getFact(getSection(model, "routing"), "Routing context limit"),
    ).toMatchObject({ value: 4_096 })
    expect(
      getFact(getSection(model, "lifecycle"), "Alias target name"),
    ).toMatchObject({ value: "Stable alias" })
    expect(
      getFact(getSection(model, "benchmarks"), "Design Arena rankings"),
    ).toMatchObject({ entries: [expect.objectContaining({ rank: 1 })] })
    expect(
      model.presentation?.sections?.some((section) => section.id === "links"),
    ).toBeFalsy()
    expect(JSON.stringify(model.presentation)).not.toContain("not-a-date")
    expect(JSON.stringify(model.presentation)).not.toContain("2026-02-30")
    expect(model.vendorEvidence).toBeUndefined()
    expect(
      response.data[1]?.presentation?.sections?.some(
        (section) => section.id === "links",
      ),
    ).toBeFalsy()
  })

  it("does not infer publisher evidence from an unscoped model identifier", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({
          data: [
            {
              id: "model-alpha",
              canonical_slug: "model-alpha",
              pricing: { prompt: "0", completion: "0" },
            },
          ],
          total_count: 1,
          links: { next: null },
        }),
      ),
    )

    const response = await openRouterProviderModelCatalog.fetchPricing({})

    expect(response.data[0]?.vendorEvidence).toBeUndefined()
  })
})

it("quotes ordered conditional prices and fixed request fees through the provider catalog capability", async () => {
  server.use(
    http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
      HttpResponse.json({
        data: [
          {
            id: "test/conditional",
            pricing: {
              prompt: "0.000002",
              completion: "0.000004",
              request: "0.01",
              overrides: [
                {
                  min_prompt_tokens: 200000,
                  prompt: "0.000004",
                  completion: "0.000008",
                },
                { min_prompt_tokens: 200000, prompt: "0.000003" },
              ],
            },
          },
        ],
        total_count: 1,
        links: { next: null },
      }),
    ),
  )
  const response = await openRouterProviderModelCatalog.fetchPricing({})
  const scenario = {
    purpose: PRICING_PURPOSES.REQUEST,
    inputTokens: 200001,
    outputTokens: 1000,
    usage: { input: 200001, output: 1000, request: 1 },
  }
  expect(
    quoteCanonicalModelPrice(response.data[0], scenario, {
      groupMultiplier: 7,
    }),
  ).toMatchObject({
    status: "complete",
    amount: expect.closeTo(0.618003, 10),
    source: { kind: "catalog" },
  })
  expect(
    quoteCanonicalModelPrice(
      response.data[0],
      {
        ...scenario,
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1, output: 1 },
      },
      {},
    ).amount,
  ).toBe(5.5)
})

it("does not reuse time-dependent top-level prices outside the supplied schedule or ignore unknown conditions", async () => {
  server.use(
    http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
      HttpResponse.json({
        data: [
          {
            id: "test/timed",
            pricing: {
              prompt: "0.000002",
              completion: "0.000004",
              overrides: [
                {
                  utc_start: 1630,
                  utc_end: 30,
                  utc_days: ["monday"],
                  prompt: "0.000001",
                },
              ],
            },
          },
          {
            id: "test/unknown",
            pricing: {
              prompt: "0.000002",
              completion: "0.000004",
              overrides: [{ future_condition: true, prompt: "0" }],
            },
          },
        ],
        total_count: 2,
        links: { next: null },
      }),
    ),
  )
  const response = await openRouterProviderModelCatalog.fetchPricing({})
  const scenario = {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    at: "2026-09-07T17:00:00Z",
    usage: { input: 1 },
  }
  expect(quoteCanonicalModelPrice(response.data[0], scenario, {}).amount).toBe(
    1,
  )
  expect(
    quoteCanonicalModelPrice(
      response.data[0],
      { ...scenario, at: "2026-09-08T17:00:00Z" },
      {},
    ).status,
  ).toBe("unavailable")
  expect(
    quoteCanonicalModelPrice(response.data[1], scenario, {}).status,
  ).not.toBe("complete")
})

it("preserves router placeholders and distinct reasoning rates through catalog admission", async () => {
  const routers = ["auto-beta", "fusion", "pareto-code", "bodybuilder", "auto"]
  const data = [
    ...routers.map((name) => ({
      id: `openrouter/${name}`,
      pricing: { prompt: "-1", completion: "-1" },
    })),
    {
      id: "perplexity/sonar-deep-research",
      pricing: {
        prompt: "0.000002",
        completion: "0.000008",
        internal_reasoning: "0.000003",
        web_search: "0.005",
      },
    },
  ]
  server.use(
    http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
      HttpResponse.json({
        data,
        total_count: data.length,
        links: { next: null },
      }),
    ),
  )
  const models = (await openRouterProviderModelCatalog.fetchPricing({})).data
  for (const model of models) {
    const quote = quoteCanonicalModelPrice(
      model,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 80, output: 20 },
      },
      {},
    )
    if (model.model_name.startsWith("openrouter/")) {
      expect(quote.status).toBe("unavailable")
      expect(quote.issues).toContainEqual({ code: "price-unavailable" })
    } else {
      expect(quote.status).toBe("partial")
      expect(quote.issues).toContainEqual({
        code: "output-token-mix",
        meter: "output",
      })
    }
    expect(quote.issues).not.toContainEqual({ code: "unsupported-rule" })
  }
})
