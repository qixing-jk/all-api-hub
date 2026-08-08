import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import {
  OPENROUTER_API_BASE_URL,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import { openRouterProviderModelCatalog } from "~/services/apiAdapters/openrouter/providerModelCatalog"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import {
  MODEL_DISPLAY_FACT_LABELS,
  MODEL_DISPLAY_FACT_TYPES,
} from "~/services/models/modelDisplayFacts"
import { server } from "~~/tests/msw/server"

describe("OpenRouter provider model catalog Adapter", () => {
  beforeEach(() => server.resetHandlers())

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
        sections: [
          {
            facts: [
              {
                type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
                label: MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
                value: 8192,
              },
            ],
          },
        ],
      },
    })
    expect(response.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
      provider: SITE_TYPES.OPENROUTER,
      supportsRuntimeModelList: false,
      supportsPricing: true,
      actionPolicy: {
        supportsRatioDisplay: false,
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
    expect(models["example/negative-price"].presentation).toBeUndefined()
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
})
