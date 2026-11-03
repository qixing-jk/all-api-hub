import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNanoGptCatalogModel } from "~/services/apiAdapters/nanogpt/modelPresentation"
import { nanoGptProviderModelCatalog } from "~/services/apiAdapters/nanogpt/providerModelCatalog"
import { fetchNanoGptDetailedModelCatalog } from "~/services/apiService/nanogpt/catalog"
import {
  PRICING_METERS,
  PRICING_SELECTION_AXES,
  PRICING_VIDEO_INPUTS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import { server } from "~~/tests/msw/server"

const CATALOG_URL = "https://api.nano-gpt.com/api/v1/models"

const pricedModel = {
  id: "openai/gpt-4.1-nano",
  object: "model",
  created: 1_790_208_000,
  owned_by: "openai",
  name: "GPT-4.1 nano",
  description: "Fast small model",
  context_length: 1_047_576,
  max_output_tokens: 32_768,
  architecture: {
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  pricing: {
    prompt: 0.1,
    completion: 0.4,
    cacheReadInputPer1kTokens: 0.000025,
    currency: "USD",
    unit: "per_million_tokens",
  },
}

beforeEach(() => server.resetHandlers())

describe("NanoGPT catalog transport", () => {
  it("reads the detailed provider catalog without credentials", async () => {
    let authorization: string | null = "unset"
    let credentials: RequestCredentials | undefined
    let detailed: string | null = null
    server.use(
      http.get(CATALOG_URL, ({ request }) => {
        authorization = request.headers.get("Authorization")
        credentials = request.credentials
        detailed = new URL(request.url).searchParams.get("detailed")
        return HttpResponse.json({
          object: "list",
          data: [pricedModel],
        })
      }),
    )

    const models = await fetchNanoGptDetailedModelCatalog()

    expect(models.map((model) => model.id)).toEqual(["openai/gpt-4.1-nano"])
    expect(detailed).toBe("true")
    expect(authorization).toBeNull()
    expect(credentials).toBe("omit")
  })

  it("rejects a response that is not the documented list envelope", async () => {
    for (const body of [
      { data: [pricedModel] },
      { object: "list", data: {} },
      { object: "list", data: [] },
    ]) {
      server.use(http.get(CATALOG_URL, () => HttpResponse.json(body)))
      await expect(fetchNanoGptDetailedModelCatalog()).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    }
  })

  it("drops rows without an id and duplicate identifiers", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json({
          object: "list",
          data: [
            { object: "model", name: "no id" },
            pricedModel,
            { ...pricedModel, name: "duplicate" },
          ],
        }),
      ),
    )

    const models = await fetchNanoGptDetailedModelCatalog()

    expect(models).toHaveLength(1)
    expect(models[0]?.displayName).toBe("GPT-4.1 nano")
  })

  it("converts per-1k cache rates to per-million tokens", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json({ object: "list", data: [pricedModel] }),
      ),
    )

    const [model] = await fetchNanoGptDetailedModelCatalog()

    // 0.000025 per 1k == 0.025 per million, matching OpenAI's cached-input rate.
    expect(model?.pricing).toEqual({
      input: 0.1,
      output: 0.4,
      cacheRead: 0.025,
    })
  })

  it("keeps rows whose price varies by modality without numeric rates", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json({
          object: "list",
          data: [
            {
              id: "qwen/qwen3.5-omni-flash",
              pricing: {
                currency: "USD",
                unit: "per_million_tokens",
                note: "varies_by_modality",
              },
            },
          ],
        }),
      ),
    )

    const [model] = await fetchNanoGptDetailedModelCatalog()

    expect(model?.pricing).toBeUndefined()
  })

  it("carries video-request rates and audio input rates", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json({
          object: "list",
          data: [
            {
              id: "qwen/qwen3.8-27b",
              pricing: {
                prompt: 0.15,
                completion: 0.7,
                cacheReadInputPer1kTokens: 0.00004,
                video_request: {
                  prompt: 0.32,
                  completion: 2.5,
                  cached_prompt: 0.032,
                },
                audio_input: 1,
                currency: "USD",
                unit: "per_million_tokens",
              },
            },
          ],
        }),
      ),
    )

    const [model] = await fetchNanoGptDetailedModelCatalog()

    expect(model?.pricing?.videoRequest).toEqual({
      input: 0.32,
      output: 2.5,
      cacheRead: 0.032,
    })
    expect(model?.pricing?.audioInput).toBe(1)
  })
})

describe("NanoGPT catalog presentation", () => {
  it("maps a priced row into the canonical model shape", () => {
    const model = createNanoGptCatalogModel({
      id: "openai/gpt-4.1-nano",
      displayName: "GPT-4.1 nano",
      description: "Fast small model",
      ownerBy: "openai",
      contextLength: 1_047_576,
      maxOutputTokens: 32_768,
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      pricing: { input: 0.1, output: 0.4, cacheRead: 0.025 },
    })

    expect(model.model_name).toBe("openai/gpt-4.1-nano")
    expect(model.display_name).toBe("GPT-4.1 nano")
    expect(model.model_description).toBe("Fast small model")
    expect(model.vendorEvidence).toEqual({ kind: "publisher", name: "openai" })
    expect(model.token_price_usd_per_million).toEqual({
      input: 0.1,
      output: 0.4,
      cache_read: 0.025,
    })
    expect(model.price_metadata).toEqual({
      source: "provider-catalog",
      precision: "exact",
    })
    expect(model.pricingPlan?.rates[PRICING_METERS.INPUT]).toEqual({
      amount: 0.1,
      currency: "USD",
      unit: "token",
      per: TOKENS_PER_MILLION,
    })
    expect(model.pricingPlan?.source).toMatchObject({
      kind: "catalog",
      url: "https://nano-gpt.com/pricing",
    })
    expect(model.presentation?.summaryFacts).toEqual([
      {
        type: "token-quantity",
        label: {
          translationKey: "displayFacts.contextLimit",
          fallback: "Context limit",
        },
        value: 1_047_576,
      },
      {
        type: "token-quantity",
        label: {
          translationKey: "displayFacts.maximumOutputTokens",
          fallback: "Maximum output tokens",
        },
        value: 32_768,
      },
    ])
    expect(model.presentation?.sections).toEqual([
      {
        id: "specifications",
        label: {
          translationKey: "displayFacts.sections.specifications",
          fallback: "Specifications",
        },
        facts: [
          {
            type: "string-list",
            label: {
              translationKey: "displayFacts.inputModalities",
              fallback: "Input modalities",
            },
            values: ["text", "image"],
          },
          {
            type: "string-list",
            label: {
              translationKey: "displayFacts.outputModalities",
              fallback: "Output modalities",
            },
            values: ["text"],
          },
        ],
      },
    ])
  })

  it("expresses video requests as a selection rule on the shared axis", () => {
    const model = createNanoGptCatalogModel({
      id: "qwen/qwen3.8-27b",
      pricing: {
        input: 0.15,
        output: 0.7,
        videoRequest: { input: 0.32, output: 2.5 },
      },
    })

    expect(model.pricingPlan?.rules).toEqual([
      {
        id: "video-request",
        conditions: [
          {
            kind: "selection",
            axis: PRICING_SELECTION_AXES.VIDEO_INPUT,
            value: PRICING_VIDEO_INPUTS.WITH_VIDEO,
          },
        ],
        rates: {
          input: {
            amount: 0.32,
            currency: "USD",
            unit: "token",
            per: TOKENS_PER_MILLION,
          },
          output: {
            amount: 2.5,
            currency: "USD",
            unit: "token",
            per: TOKENS_PER_MILLION,
          },
        },
      },
    ])
  })

  it("reports an unavailable price instead of a fabricated zero", () => {
    const model = createNanoGptCatalogModel({
      id: "qwen/qwen3.5-omni-flash",
      description: "Modality dependent pricing",
    })

    expect(model.token_price_usd_per_million).toBeUndefined()
    expect(model.price_metadata).toEqual({
      source: "provider-catalog",
      precision: "unavailable",
      unavailable_reason: "official-price-missing",
    })
    expect(model.pricingPlan?.rates).toEqual({})
    expect(model.presentation).toBeUndefined()
  })

  it("keeps authoritative zero prices for free models", () => {
    const model = createNanoGptCatalogModel({
      id: "auto-model",
      pricing: { input: 0, output: 0 },
    })

    expect(model.token_price_usd_per_million).toEqual({ input: 0, output: 0 })
    expect(model.price_metadata).toEqual({
      source: "provider-catalog",
      precision: "exact",
    })
  })
})

describe("NanoGPT provider catalog capability", () => {
  it("declares a provider-wide, non-runtime catalog source", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json({ object: "list", data: [pricedModel] }),
      ),
    )

    expect(nanoGptProviderModelCatalog.source).toMatchObject({
      provider: SITE_TYPES.NANOGPT,
      displayName: "NanoGPT",
    })
    expect(nanoGptProviderModelCatalog.personalized).toBeUndefined()

    const response = await nanoGptProviderModelCatalog.fetchPricing({})
    expect(response.success).toBe(true)
    expect(response.model_list_source).toMatchObject({
      kind: "provider-catalog",
      provider: SITE_TYPES.NANOGPT,
      catalogScope: "provider",
      supportsRuntimeModelList: false,
      supportsPricing: true,
      actionPolicy: {
        supportsCredentialVerification: true,
        supportsBatchCredentialVerification: true,
        supportsCliVerification: true,
        supportsTokenCompatibility: false,
        supportsGroupFiltering: false,
      },
    })
    expect(response.groupAccess).toEqual({ kind: "not-applicable" })
    expect(response.data).toHaveLength(1)
  })

  it("surfaces a sanitized error when the catalog is unavailable", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json(
          { error: { message: "upstream down" } },
          { status: 502 },
        ),
      ),
    )

    await expect(nanoGptProviderModelCatalog.fetchPricing({})).rejects.toThrow(
      /upstream down/,
    )
  })
})
