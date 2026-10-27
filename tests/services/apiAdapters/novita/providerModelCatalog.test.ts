import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { novitaProviderModelCatalog } from "~/services/apiAdapters/novita/providerModelCatalog"
import { isValidProviderModelCatalogPricing } from "~/services/modelList/providerCatalogAdmission"
import { server } from "~~/tests/msw/server"

// Live catalog row captured on 2026-10-25 from
// https://api.novita.ai/openai/v1/models.
const modelRow = {
  created: 1792375957,
  id: "deepseek/deepseek-v4.1-flash-1017",
  object: "model",
  owned_by: "novita",
  input_token_price_per_m: 3000,
  output_token_price_per_m: 12000,
  pricing: {
    prompt: {
      origin_price_per_m: 3000,
      price_per_m: 3000,
      origin_price_per_m_decimal: "0.3",
      price_per_m_decimal: "0.3",
    },
    completion: {
      origin_price_per_m: 12000,
      price_per_m: 12000,
      origin_price_per_m_decimal: "1.2",
      price_per_m_decimal: "1.2",
    },
    input_cache_read: {
      origin_price_per_m: 60,
      price_per_m: 60,
      origin_price_per_m_decimal: "0.006",
      price_per_m_decimal: "0.006",
    },
  },
  is_tiered_billing: false,
  title: "deepseek/deepseek-v4.1-flash-1017",
  description: "",
  tags: [],
  context_size: 1048576,
  status: 1,
  display_name: "DeepSeek V4.1 Flash 1017",
  model_type: "chat",
  max_output_tokens: 393216,
  features: ["serverless", "function-calling"],
  endpoints: ["chat/completions", "anthropic", "responses"],
  input_modalities: ["text", "image"],
  output_modalities: ["text"],
}

describe("Novita provider model catalog", () => {
  beforeEach(() => server.resetHandlers())

  it("declares the public catalog source and cache window", () => {
    expect(novitaProviderModelCatalog.source).toMatchObject({
      provider: SITE_TYPES.NOVITA,
      displayName: "Novita AI",
    })
    expect(novitaProviderModelCatalog.source.cacheTtlMs).toBeGreaterThan(0)
  })

  it("adapts decimal USD prices into the canonical catalog shape", async () => {
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", () =>
        HttpResponse.json({ data: [modelRow] }),
      ),
    )

    const response = await novitaProviderModelCatalog.fetchPricing({})
    expect(response.success).toBe(true)
    expect(response.model_list_source).toMatchObject({
      kind: "provider-catalog",
      provider: SITE_TYPES.NOVITA,
      catalogScope: "provider",
      supportsRuntimeModelList: false,
      supportsPricing: true,
    })
    expect(response.data).toEqual([
      {
        model_name: "deepseek/deepseek-v4.1-flash-1017",
        display_name: "DeepSeek V4.1 Flash 1017",
        quota_type: 0,
        model_ratio: 0,
        model_price: 0,
        token_price_usd_per_million: {
          input: 0.3,
          output: 1.2,
          cache_read: 0.006,
        },
        price_metadata: {
          source: "provider-catalog",
          precision: "exact",
        },
        completion_ratio: 1,
        enable_groups: [],
        supported_endpoint_types: [
          "chat/completions",
          "anthropic",
          "responses",
        ],
      },
    ])
  })

  it("falls back to the integer 1/10000 USD price when the decimal string is absent", async () => {
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              ...modelRow,
              id: "example/legacy-row",
              pricing: {
                prompt: { price_per_m: 3000 },
                completion: { price_per_m: 12000 },
              },
            },
          ],
        }),
      ),
    )

    const response = await novitaProviderModelCatalog.fetchPricing({})
    expect(response.data[0]).toMatchObject({
      model_name: "example/legacy-row",
      token_price_usd_per_million: { input: 0.3, output: 1.2 },
    })
  })

  it("marks missing prices as unavailable instead of guessing", async () => {
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", () =>
        HttpResponse.json({
          data: [{ ...modelRow, id: "example/free", pricing: {} }],
        }),
      ),
    )

    const response = await novitaProviderModelCatalog.fetchPricing({})
    expect(response.data[0]).toMatchObject({
      model_name: "example/free",
      price_metadata: {
        source: "provider-catalog",
        precision: "unavailable",
        unavailable_reason: "official-price-missing",
      },
    })
    expect(response.data[0]?.token_price_usd_per_million).toBeUndefined()
  })

  it("rejects a malformed catalog body", async () => {
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", () =>
        HttpResponse.json({ data: "not-a-list" }),
      ),
    )
    await expect(novitaProviderModelCatalog.fetchPricing({})).rejects.toThrow()
  })

  it("produces a response the model-list admission accepts", async () => {
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              ...modelRow,
              id: "zai-org/glm-5.3-p",
              display_name: "  Z.ai GLM 5.3 P  ",
              // Novita publishes descriptions with a trailing space; admission
              // rejects untrimmed strings.
              description: "Flagship model description ending with a space. ",
            },
          ],
        }),
      ),
    )

    const response = await novitaProviderModelCatalog.fetchPricing({})
    expect(
      isValidProviderModelCatalogPricing(response, SITE_TYPES.NOVITA),
    ).toBe(true)
    expect(response.data[0]).toMatchObject({
      model_name: "zai-org/glm-5.3-p",
      display_name: "Z.ai GLM 5.3 P",
      model_description: "Flagship model description ending with a space.",
    })
  })
})
