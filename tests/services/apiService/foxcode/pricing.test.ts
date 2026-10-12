import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  fetchChannels,
  fetchInferenceOrigin,
} from "~/services/apiService/foxcode/catalog"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://foxcode.rjj.cc"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "user" },
}
beforeEach(async () => {
  const boundary = installCookieTransport()
  const cookie = (await browser.cookies.getAll({}))[0]!
  boundary.cookies.mockResolvedValue([
    { ...cookie, domain: "foxcode.rjj.cc", name: "auth_token" },
  ])
  server.use(
    http.get(`${origin}/api/auth/me`, () =>
      HttpResponse.json({
        success: true,
        data: { user: { id: "user", name: "Work" } },
      }),
    ),
    http.get(`${origin}/api/system-config/public/model_square_config`, () =>
      HttpResponse.json({
        success: true,
        data: {
          config: {
            channels: [
              {
                key: "official",
                name: "Official",
                models: ["claude", "unknown"],
                groupKeys: ["anthropic"],
                quotaMultiplier: 0.125,
                groupOverrides: {},
              },
              {
                key: "discount",
                name: "Discount",
                models: ["claude", "image"],
                groupKeys: ["openai"],
                quotaMultiplier: 4,
                groupOverrides: {},
              },
            ],
          },
        },
      }),
    ),
    http.get(`${origin}/api/model-pricing`, () =>
      HttpResponse.json({
        success: true,
        data: {
          pricing: {
            claude: {
              times: false,
              input: 3,
              output: 15,
              cacheRead: 0.3,
              cacheWrite: 3.75,
            },
            image: { times: true, perCall: 0.25 },
          },
        },
      }),
    ),
  )
})
afterEach(() => vi.restoreAllMocks())

it.each([
  {},
  {
    channels: [
      { key: "same", models: [] },
      { key: "same", models: [] },
    ],
  },
  { channels: [{ key: "bad", models: [null] }] },
])("rejects malformed channel configuration", async (config) => {
  server.use(
    http.get(`${origin}/api/system-config/public/model_square_config`, () =>
      HttpResponse.json({ success: true, data: { config } }),
    ),
  )
  await expect(fetchChannels(request)).rejects.toMatchObject({
    code: "JSON_PARSE_ERROR",
  })
})

it("preserves channel labels and explicitly unavailable multipliers", async () => {
  server.use(
    http.get(`${origin}/api/system-config/public/model_square_config`, () =>
      HttpResponse.json({
        success: true,
        data: {
          channels: [
            {
              key: "localized",
              name: { "zh-CN": "本地" },
              models: [],
              groupKey: "openai",
            },
            { key: "fallback", models: [], quotaMultiplier: 0 },
          ],
        },
      }),
    ),
  )
  expect(await fetchChannels(request)).toMatchObject([
    { key: "localized", name: "本地", protocols: ["openai"] },
    { key: "fallback", name: "fallback", quotaMultiplier: undefined },
  ])
})

it.each([
  {},
  { defaultKey: "missing", endpoints: [] },
  ...[
    "bad-url",
    "http://inference.example",
    "https://user:password@inference.example",
    "https://inference.example?token=private",
  ].map((baseUrl) => ({
    defaultKey: "primary",
    endpoints: [{ key: "primary", baseUrl }],
  })),
])(
  "rejects invalid inference routes before projecting credentials",
  async (data) => {
    server.use(
      http.get(`${origin}/api/system-config/public/api_endpoint_config`, () =>
        HttpResponse.json({ success: true, data }),
      ),
    )
    await expect(fetchInferenceOrigin(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  },
)

it("rejects missing pricing instead of inventing rates", async () => {
  server.use(
    http.get(`${origin}/api/model-pricing`, () =>
      HttpResponse.json({ success: true, data: {} }),
    ),
  )
  await expect(
    getSiteTypeCapabilities("foxcode").account!.modelPricing!.fetchPricing(
      request,
    ),
  ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
})

it("projects native USD token and request rates with channel multipliers through the shared calculator", async () => {
  const catalog =
    await getSiteTypeCapabilities(
      "foxcode",
    ).account!.modelPricing!.fetchPricing(request)
  expect(catalog.model_list_source).toMatchObject({
    kind: "provider-catalog",
    supportsPricing: true,
  })
  expect(catalog.groupRatios).toEqual({ official: 8, discount: 0.25 })
  const model = catalog.data.find((model) => model.model_name === "claude")!
  expect(
    calculateModelPrice(model, catalog.groupRatios.official!),
  ).toMatchObject({
    usdPerMillionTokens: {
      input: 24,
      output: 120,
      cacheRead: 2.4,
      cacheWrite: 30,
    },
  })
  expect(
    calculateModelPrice(model, catalog.groupRatios.discount!),
  ).toMatchObject({ usdPerMillionTokens: { input: 0.75, output: 3.75 } })
  expect(
    calculateModelPrice(
      catalog.data.find((model) => model.model_name === "image")!,
      0.25,
    ),
  ).toMatchObject({ usdPerCall: 0.0625 })
  expect(
    catalog.data.find((model) => model.model_name === "unknown")!.price_metadata
      ?.precision,
  ).toBe("unavailable")
})
