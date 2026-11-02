import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { aimlApiProviderModelCatalog } from "~/services/apiAdapters/aimlapi/modelCatalog"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { server } from "~~/tests/msw/server"

it("projects published context and output limits as typed catalogue facts", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/models", () =>
      HttpResponse.json({
        data: [
          {
            id: "provider/model",
            type: "openai/chat-completions",
            info: {
              name: "Model",
              developer: "Provider",
              contextLength: 128000,
              outputMax: 8192,
            },
          },
        ],
      }),
    ),
  )
  const result = await aimlApiProviderModelCatalog.fetchPricing({})
  expect(result.data[0]?.presentation?.summaryFacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "token-quantity", value: 128000 }),
      expect.objectContaining({ type: "token-quantity", value: 8192 }),
    ]),
  )
})

it("retains unpriced models without requesting HTML, details or sitemap fallbacks", async () => {
  const requests: string[] = []
  server.use(
    http.get("https://api.aimlapi.com/v1/models", () =>
      HttpResponse.json({
        data: [
          {
            id: "provider/unpriced",
            type: "openai/chat-completions",
            info: { name: "Unpriced", developer: "Provider" },
          },
        ],
      }),
    ),
    http.get("https://aimlapi.com/*", ({ request }) => {
      requests.push(request.url)
      return new HttpResponse("", { status: 503 })
    }),
  )
  const result = await aimlApiProviderModelCatalog.fetchPricing({})
  expect(result.data.map((model) => model.model_name)).toEqual([
    "provider/unpriced",
  ])
  expect(requests).toEqual([])
  expect(result.data[0]?.price_metadata?.unavailable_reason).toBe(
    "official-price-missing",
  )
})

it.each([
  "openai/gpt-6.1-terra",
  "openai/gpt-6.1-terra-pro",
  "openai/gpt-5.6-luna-pro",
  "openai/gpt-5.6-terra-pro",
  "anthropic/claude-haiku-5-5",
  "anthropic/claude-haiku-5.5",
])(
  "keeps threshold references without selecting tiers through a model whitelist (%s)",
  async (id) => {
    const units = (price: number) =>
      ["provided", "generated"].map((origin) => ({
        type: "charge",
        name: "token",
        content: "text",
        origin,
        price,
        per: 1000000,
        variable: false,
      }))
    server.use(
      http.get("https://api.aimlapi.com/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id,
              type: "openai/chat-completions",
              info: { name: id, developer: "Provider" },
              pricing: {
                kind: "fixed",
                currency: "USD",
                units: units(1),
                dimensions: [],
                variants: [],
                thresholds: [
                  { from: 0, units: units(1) },
                  {
                    from: id.startsWith("anthropic/") ? 100000 : 272000,
                    units: units(2),
                  },
                ],
              },
            },
          ],
        }),
      ),
    )
    const model = (await aimlApiProviderModelCatalog.fetchPricing({})).data[0]!
    expect(model.pricingPlan?.source.rulesUnavailable).toBe(true)
    expect(model.pricingPlan?.rates.input?.amount).toBe(1)
    expect(model.pricingPlan?.rules).toEqual([])
    expect(model.price_metadata?.precision).toBe("unavailable")
    expect(model.pricingPlan?.issues).toContainEqual({
      code: "unverified-axis",
      reason: "threshold-basis-unverified",
    })
    for (const input of [100000, 100001, 272000, 272001]) {
      expect(
        quoteCanonicalModelPrice(
          model,
          { purpose: "request", usage: { input, output: 1000 } },
          { currency: "USD" },
        ),
      ).toMatchObject({ status: "unavailable", amount: null })
    }
  },
)

it("does not borrow pricing from version punctuation or shared documentation identities", async () => {
  const info = {
    name: "Same readable name",
    developer: "Provider",
    description: "Same description",
    releasedAt: "2026-01-01",
    docsUrl: "https://docs.aimlapi.com/api-references/same-model",
  }
  server.use(
    http.get("https://api.aimlapi.com/v1/models", () =>
      HttpResponse.json({
        data: [
          {
            id: "provider/model-1.5",
            info,
            type: "openai/chat-completions",
            pricing: {
              kind: "fixed",
              currency: "USD",
              units: [
                {
                  type: "charge",
                  name: "token",
                  content: "text",
                  origin: "provided",
                  price: 2,
                  per: 1000000,
                  variable: false,
                },
              ],
            },
          },
          ...["provider/model-1-5", "provider/renamed-model"].map((id) => ({
            id,
            info,
            type: "openai/chat-completions",
          })),
        ],
      }),
    ),
  )
  const models = (await aimlApiProviderModelCatalog.fetchPricing({})).data
  expect(models).toHaveLength(3)
  expect(models[0]?.pricingPlan?.rates.input?.amount).toBe(2)
  for (const model of models.slice(1)) {
    expect(model.pricingPlan).toBeUndefined()
    expect(model.price_metadata?.unavailable_reason).toBe(
      "official-price-missing",
    )
  }
})
