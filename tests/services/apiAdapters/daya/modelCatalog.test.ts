import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dayaCapabilities } from "~/services/apiAdapters/daya"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://api.dayaai.com"
const envelope = (data: unknown) => ({ code: 0, message: "success", data })
// Console catalogue captured 2026-10-21: these USD/M prices already include
// display_discount_multiplier; it is used only for the crossed-out list price.
const model = {
  model: "gpt-6-astra",
  name: "GPT-6 Astra",
  provider_name: "OpenAI",
  protocols: ["OpenAI Chat Completions", "OpenAI Responses"],
  output_modalities: ["text"],
  input_price_per_million: 2,
  output_price_per_million: 10,
  cache_read_price_per_million: 0.2,
  display_discount_multiplier: 0.2,
  context_window: 1050000,
  max_output_tokens: 128000,
}
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
}
describe("Daya model pricing", () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    installCookieTransport("daya_sid", "api.dayaai.com")
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json(envelope({ id: 615, username: "test", balance: 4 })),
      ),
    )
  })
  it("loads provider-wide published prices without applying the discount twice", async () => {
    server.use(
      http.get(`${origin}/api/v1/catalog/models`, () =>
        HttpResponse.json(envelope([model])),
      ),
    )
    const snapshot =
      await dayaCapabilities.account!.modelPricing!.fetchPricing(request)
    expect(snapshot.model_list_source).toMatchObject({
      kind: "provider-catalog",
      catalogScope: "provider",
      supportsPricing: true,
      actionPolicy: {
        supportsGroupFiltering: false,
        supportsTokenCompatibility: false,
      },
    })
    expect(snapshot.data[0]?.presentation?.summaryFacts).toContainEqual(
      expect.objectContaining({
        type: "text",
        value: expect.objectContaining({
          translationKey: "displayFacts.providerReferenceCatalog",
        }),
      }),
    )
    expect(snapshot.data).toHaveLength(1)
    expect(snapshot.data[0]).toMatchObject({
      model_name: "gpt-6-astra",
      token_price_usd_per_million: { input: 2, output: 10, cache_read: 0.2 },
      price_metadata: { precision: "exact" },
      supported_endpoint_types: ["/v1/chat/completions", "/v1/responses"],
    })
  })
  it("keeps missing prices unavailable instead of inventing free rates", async () => {
    server.use(
      http.get(`${origin}/api/v1/catalog/models`, () =>
        HttpResponse.json(
          envelope([{ ...model, input_price_per_million: null }]),
        ),
      ),
    )
    const snapshot =
      await dayaCapabilities.account!.modelPricing!.fetchPricing(request)
    expect(snapshot.data[0]?.token_price_usd_per_million).toBeUndefined()
    expect(snapshot.data[0]?.price_metadata).toMatchObject({
      precision: "unavailable",
      unavailable_reason: "official-price-missing",
    })
  })
  it("does not interpret image-only output placeholders as free token pricing", async () => {
    server.use(
      http.get(`${origin}/api/v1/catalog/models`, () =>
        HttpResponse.json(
          envelope([
            {
              ...model,
              model: "gpt-image-2",
              protocols: ["OpenAI Images"],
              output_modalities: ["image"],
              input_price_per_million: 1,
              output_price_per_million: 0,
            },
          ]),
        ),
      ),
    )
    const snapshot =
      await dayaCapabilities.account!.modelPricing!.fetchPricing(request)
    expect(snapshot.data[0]?.token_price_usd_per_million).toBeUndefined()
    expect(snapshot.data[0]?.price_metadata).toMatchObject({
      precision: "unavailable",
      unavailable_reason: "pricing-source-unavailable",
      billing_mode_known: false,
    })
  })
  it("accepts an empty catalogue", async () => {
    server.use(
      http.get(`${origin}/api/v1/catalog/models`, () =>
        HttpResponse.json(envelope([])),
      ),
    )
    expect(
      (await dayaCapabilities.account!.modelPricing!.fetchPricing(request))
        .data,
    ).toEqual([])
  })

  it("keeps supported protocols while omitting unknown protocols and unavailable cache rates", async () => {
    server.use(
      http.get(`${origin}/api/v1/catalog/models`, () =>
        HttpResponse.json(
          envelope([
            {
              ...model,
              protocols: ["OpenAI Responses", "unknown", "OpenAI Responses"],
              cache_read_price_per_million: null,
            },
          ]),
        ),
      ),
    )
    const snapshot =
      await dayaCapabilities.account!.modelPricing!.fetchPricing(request)
    expect(snapshot.data[0]).toMatchObject({
      supported_endpoint_types: ["/v1/responses"],
      token_price_usd_per_million: { input: 2, output: 10 },
    })
    expect(snapshot.data[0]?.token_price_usd_per_million).not.toHaveProperty(
      "cache_read",
    )
    server.use(
      http.get(`${origin}/api/v1/catalog/models`, () =>
        HttpResponse.json(envelope([{ ...model, model: " " }])),
      ),
    )
    await expect(
      dayaCapabilities.account!.modelPricing!.fetchPricing(request),
    ).rejects.toThrow("Invalid Daya API response")
  })
  it("rejects malformed catalogues and expired sessions", async () => {
    server.use(
      http.get(`${origin}/api/v1/catalog/models`, () =>
        HttpResponse.json(envelope({ items: [model] })),
      ),
    )
    await expect(
      dayaCapabilities.account!.modelPricing!.fetchPricing(request),
    ).rejects.toThrow("Invalid Daya API response")
    server.use(
      http.get(
        `${origin}/api/v1/auth/me`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    await expect(
      dayaCapabilities.account!.modelPricing!.fetchPricing(request),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
