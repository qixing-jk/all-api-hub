import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  krillModelCatalog,
  krillModelPricing,
} from "~/services/apiAdapters/krill/modelCatalog"
import { pricingPlanSchema } from "~/services/modelPricing/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://www.krill-code.com"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "47044" },
}
const model = {
  model_name: "claude-sonnet-5-5",
  provider: "Claude",
  enabled: true,
  billing_mode: "token",
  input_token_price: "2",
  output_token_price: "10",
  cache_read_input_token_price: "0.2",
  cache_creation_token_price: "2.5",
  cache_creation_5m_token_price: "2.5",
  cache_creation_1h_token_price: "4",
  request_price_usd: "0",
  context_window: 1000000,
  max_output_tokens: 128000,
  route_multipliers: { 直连: "0.9", cdn: "0.95" },
}
function respond(path: string, data: unknown) {
  server.use(
    http.get(`${origin}${path}`, () =>
      HttpResponse.json({ success: true, data }),
    ),
  )
}
beforeEach(() => {
  const boundary = installCookieTransport()
  boundary.cookies.mockResolvedValue([
    {
      name: "krill_jwt",
      value: "console-session",
      domain: "www.krill-code.com",
      path: "/",
      secure: true,
      httpOnly: false,
      hostOnly: true,
      session: false,
      sameSite: "lax",
      storeId: "0",
      firstPartyDomain: "",
      expirationDate: Date.now() / 1000 + 3600,
    },
  ])
  respond("/api/auth/me", {
    id: 47044,
    email: "test@example.com",
    credit_balance_usd: "0",
    enterprise_memberships: [],
  })
  respond("/api/model-pricing", [model])
  respond("/api/endpoint-settings/me", {
    routes: [
      { key: "均衡", name: "国内极速", enabled: true },
      { key: "直连", name: "海外线路", enabled: true },
    ],
  })
  respond("/api/my/channels", [
    {
      id: 37,
      name: "Max 官渠高可用",
      billing_multiplier: "2.0830",
      default_routed: true,
    },
  ])
  respond("/api/my/model-routes", [
    { model_name: model.model_name, provider_id: 37 },
  ])
  respond("/api/my/dedicated-models", [])
})
afterEach(() => vi.restoreAllMocks())

it("shows the native default route and channel price, including both cache lifetimes", async () => {
  const result = await krillModelPricing.fetchPricing(request as never)
  const row = result.data[0]!
  expect(row.price_metadata?.precision).toBe("exact")
  const plan = pricingPlanSchema.parse(row.pricingPlan)
  expect(plan.rates.input?.amount).toBeCloseTo(3.7494)
  expect(plan.rates.output?.amount).toBeCloseTo(18.747)
  expect(plan.rates.cacheRead?.amount).toBeCloseTo(0.37494)
  expect(plan.rates.cacheWrite?.amount).toBeCloseTo(4.68675)
  expect(plan.rates.cacheWrite1h?.amount).toBeCloseTo(7.4988)
  expect(plan.groupMultiplier).toBe("included")
  expect(plan.source.pricingDescription?.zh).toContain("1.8747")
  expect(plan.source.pricingDescription?.zh).toContain("海外线路")
  expect(plan.limits).toEqual({ totalTokens: 1000000, outputTokens: 128000 })
  expect(result.groupAccess).toEqual({ kind: "not-applicable" })
  expect(row.enable_groups).toEqual([])
  expect(row.token_price_usd_per_million).toBeUndefined()
  expect(row.presentation?.summaryFacts).toContainEqual({
    type: "token-quantity",
    label: {
      translationKey: "displayFacts.contextLimit",
      fallback: "Context limit",
    },
    value: 1000000,
  })
})

it("uses route-specific dedicated prices directly instead of multiplying them again", async () => {
  respond("/api/my/dedicated-models", [
    { ...model, provider_id: 37, route_key: "", input_token_price: "9" },
    {
      ...model,
      provider_id: 37,
      route_key: "直连",
      input_token_price: "1.5",
      output_token_price: "7.5",
      cache_creation_1h_token_price: "3",
    },
  ])
  const { data } = await krillModelPricing.fetchPricing(request as never)
  const plan = pricingPlanSchema.parse(data[0]!.pricingPlan)
  expect(plan.rates.input?.amount).toBe(1.5)
  expect(plan.rates.output?.amount).toBe(7.5)
  expect(plan.rates.cacheWrite1h?.amount).toBe(3)
  expect(plan.source.pricingDescription?.zh).toContain("专属")
})

it("applies high-context prices only above the native input threshold", async () => {
  respond("/api/model-pricing", [
    {
      ...model,
      high_context_rule: {
        enabled: true,
        input_tokens_threshold: 200000,
        input_token_price: "4",
        output_token_price: "15",
        cache_read_input_token_price: "0.4",
        cache_creation_token_price: "5",
        cache_creation_5m_token_price: "5",
        cache_creation_1h_token_price: "8",
      },
    },
  ])
  const { data } = await krillModelPricing.fetchPricing(request as never)
  const plan = pricingPlanSchema.parse(data[0]!.pricingPlan)
  const low = quoteModelPrice(plan, {
    purpose: "request",
    inputTokens: 200000,
    usage: { input: 200000 },
  })
  const high = quoteModelPrice(plan, {
    purpose: "request",
    inputTokens: 200001,
    usage: { input: 200001 },
  })
  expect(
    low.lines.find((line) => line.meter === "input")?.rate.amount,
  ).toBeCloseTo(3.7494)
  expect(
    high.lines.find((line) => line.meter === "input")?.rate.amount,
  ).toBeCloseTo(7.4988)
  expect(plan.rules[0]!.rates.cacheWrite1h?.amount).toBeCloseTo(14.9976)
})

it("does not silently present time-window rates with an unknown timezone as a complete quote", async () => {
  respond("/api/model-pricing", [
    {
      ...model,
      time_window_rules: [
        {
          enabled: true,
          label: "谷时优惠",
          start_minute: 1080,
          end_minute: 540,
          input_token_price: "1",
          output_token_price: "5",
          cache_read_input_token_price: "0.1",
        },
      ],
    },
  ])
  const { data } = await krillModelPricing.fetchPricing(request as never)
  const plan = pricingPlanSchema.parse(data[0]!.pricingPlan)
  expect(plan.issues).toContainEqual({
    code: "unverified-axis",
    meters: ["input", "output", "cacheRead"],
  })
  expect(plan.source.pricingDescription?.zh).toContain("18:00–09:00")
  expect(
    quoteModelPrice(plan, { purpose: "request", usage: { input: 1 } }).status,
  ).not.toBe("complete")
})

it("quotes duration billing per second rather than per request", async () => {
  respond("/api/model-pricing", [
    { ...model, billing_mode: "duration", request_price_usd: "0.1" },
  ])
  const { data } = await krillModelPricing.fetchPricing(request as never)
  const plan = pricingPlanSchema.parse(data[0]!.pricingPlan)
  expect(plan.rates.request).toBeUndefined()
  expect(plan.rates.videoSeconds).toMatchObject({
    currency: "USD",
    unit: "second",
    per: 1,
  })
  expect(plan.rates.videoSeconds?.amount).toBeCloseTo(0.18747)
  expect(
    quoteModelPrice(plan, { purpose: "request", usage: { videoSeconds: 10 } })
      .amount,
  ).toBeCloseTo(1.8747)
})

it("preserves the dedicated high-context schedule without reapplying route multipliers", async () => {
  respond("/api/my/dedicated-models", [
    {
      ...model,
      provider_id: 37,
      route_key: "直连",
      high_context_enabled: true,
      high_context_input_tokens_threshold: 200000,
      high_context_input_token_price: "3",
      high_context_output_token_price: "20",
      high_context_cache_creation_token_price: "4",
      high_context_cache_read_input_token_price: "0.3",
    },
  ])
  const { data } = await krillModelPricing.fetchPricing(request as never)
  const plan = pricingPlanSchema.parse(data[0]!.pricingPlan)
  expect(plan.rules[0]?.rates.input?.amount).toBe(3)
  expect(plan.rules[0]?.rates.cacheWrite1h?.amount).toBe(4)
})

it("uses the highest applicable channel rate even when that channel is not default-routed", async () => {
  respond("/api/my/channels", [
    { id: 37, name: "low", billing_multiplier: "1", default_routed: true },
    { id: 35, name: "high", billing_multiplier: "3", default_routed: false },
  ])
  respond("/api/my/model-routes", [
    { model_name: model.model_name, provider_id: 37 },
    { model_name: model.model_name, provider_id: 35 },
  ])
  respond("/api/my/dedicated-models", [
    { ...model, provider_id: 37, route_key: "直连", input_token_price: "0.01" },
  ])
  const { data } = await krillModelPricing.fetchPricing(request as never)
  expect(data[0]!.pricingPlan?.rates.input?.amount).toBeCloseTo(5.4)
})

it("preserves native per-request billing after applying the effective multiplier", async () => {
  respond("/api/model-pricing", [
    { ...model, billing_mode: "request", request_price_usd: "0.5" },
  ])
  const { data } = await krillModelPricing.fetchPricing(request as never)
  const plan = pricingPlanSchema.parse(data[0]!.pricingPlan)
  expect(plan.rates.request?.amount).toBeCloseTo(0.93735)
  expect(plan.rates.input).toBeUndefined()
})

it.each([
  { billing_mode: "unknown" },
  { route_multipliers: { 直连: "NaN" } },
  { cache_creation_1h_token_price: "-1" },
])(
  "rejects malformed pricing instead of fabricating a usable price: %j",
  async (patch) => {
    respond("/api/model-pricing", [{ ...model, ...patch }])
    await expect(
      krillModelPricing.fetchPricing(request as never),
    ).rejects.toThrow()
  },
)

it("does not treat an unavailable dedicated-price response as proof that there are no overrides", async () => {
  server.use(
    http.get(`${origin}/api/my/dedicated-models`, () =>
      HttpResponse.json(
        { success: false, code: 500, message: "unavailable" },
        { status: 500 },
      ),
    ),
  )
  await expect(
    krillModelPricing.fetchPricing(request as never),
  ).rejects.toThrow()
})

it("requires account context for model discovery and enriches account pricing", async () => {
  await expect(
    krillModelCatalog.fetchModels(request as never),
  ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  respond("/api/models", ["gpt-example", " ", "gpt-example", 3])
  expect(
    await krillModelCatalog.fetchModels(
      request as never,
      { accountRequest: request } as never,
    ),
  ).toEqual([{ id: "gpt-example" }])
  expect(
    (
      await krillModelCatalog.enrichPricing!({
        accountRequest: request,
      } as never)
    ).data,
  ).toHaveLength(1)
})
it("selects the most expensive dedicated price across the model's channels", async () => {
  respond("/api/my/model-routes", [
    { model_name: model.model_name, provider_id: 37 },
    { model_name: model.model_name, provider_id: 35 },
  ])
  respond("/api/my/dedicated-models", [
    { ...model, provider_id: 37, route_key: "", input_token_price: "1" },
    { ...model, provider_id: 35, route_key: "", input_token_price: "5" },
  ])
  expect(
    (await krillModelPricing.fetchPricing(request as never)).data[0]!
      .pricingPlan?.rates.input?.amount,
  ).toBe(5)
})
it("retains base prices and an honest default route when catalogs have no routing metadata", async () => {
  respond("/api/endpoint-settings/me", { routes: [] })
  respond("/api/my/model-routes", [])
  respond("/api/my/channels", [])
  respond("/api/model-pricing", [
    {
      ...model,
      provider: null,
      context_window: null,
      max_output_tokens: null,
      cache_creation_1h_token_price: undefined,
      route_multipliers: undefined,
    },
  ])
  const row = (await krillModelPricing.fetchPricing(request as never)).data[0]!
  expect(row.pricingPlan?.rates.input?.amount).toBe(2)
  expect(row.pricingPlan?.source.pricingDescription?.en).toContain(
    "Default route",
  )
  expect(row.presentation?.summaryFacts).toEqual([])
  expect(row.vendorEvidence).toBeUndefined()
})
it.each([
  ["/api/model-pricing", [{ ...model, input_token_price: "9".repeat(400) }]],
  [
    "/api/model-pricing",
    [
      {
        ...model,
        high_context_rule: { enabled: true, input_tokens_threshold: -1 },
      },
    ],
  ],
  ["/api/model-pricing", [{ ...model, time_window_rules: {} }]],
  ["/api/model-pricing", [{ ...model, time_window_rules: [null] }]],
  [
    "/api/model-pricing",
    [
      {
        ...model,
        time_window_rules: [
          { enabled: true, start_minute: 1440, end_minute: 1 },
        ],
      },
    ],
  ],
  ["/api/endpoint-settings/me", {}],
  ["/api/endpoint-settings/me", { routes: [{ key: 1, name: "bad" }] }],
  ["/api/my/model-routes", [{ model_name: "x", provider_id: 0 }]],
  ["/api/my/dedicated-models", [{ provider_id: 0 }]],
])("rejects malformed price context from %s", async (path, data) => {
  respond(path as string, data)
  await expect(
    krillModelPricing.fetchPricing(request as never),
  ).rejects.toThrow()
})
