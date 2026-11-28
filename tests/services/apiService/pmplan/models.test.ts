import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { fetchPmplanModels } from "~/services/apiService/pmplan/models"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

afterEach(() => vi.restoreAllMocks())
it.each([
  ["lite", "Lite", 1],
  ["lite", "Lite", 2],
  ["go", "Go", 1],
  ["custom-tier", "custom-tier", 1],
  ["constructor", "constructor", 1],
] as const)(
  "preserves plan %s and uses channel-level eligibility despite a restricted square entry",
  async (plan, label, restrictedChannels) => {
    const { getSiteTypeCapabilities } =
      await import("~/services/apiAdapters/registry")
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.get("https://plan.pmcat.top/api/model-square", () =>
        HttpResponse.json({
          plan,
          total: 2,
          available: 0,
          models: [
            {
              name: "model-a",
              input_micro: 1000000,
              output_micro: 3000000,
              channel_count: 1,
              available_now: false,
              tiers: [plan, "standard"],
            },
            {
              name: "model-b",
              input_micro: 1000000,
              output_micro: 3000000,
              channel_count: restrictedChannels,
              available_now: false,
              tiers: ["standard"],
            },
          ],
        }),
      ),
      http.get("https://plan.pmcat.top/api/models", () =>
        HttpResponse.json({
          models: [
            {
              name: "model-a",
              input_micro: 1000000,
              output_micro: 3000000,
              channel_count: 1,
            },
          ],
        }),
      ),
    )
    const request = {
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "pmplan_session=saved",
      },
    }
    const result =
      await getSiteTypeCapabilities(
        "pmplan",
      ).account!.modelPricing!.fetchPricing(request)
    expect(result.model_list_source).toMatchObject({
      kind: "user-scoped",
      catalogScope: "personalized",
      provider: "pmplan",
      actionPolicy: { supportsGroupFiltering: false },
    })
    expect(result.data).toMatchObject([
      { model_name: "model-a", availability: { available: true } },
      { model_name: "model-b", availability: { available: false } },
    ])
    expect(result.data[1]!.presentation?.summaryFacts).toContainEqual({
      type: "string-list",
      label: {
        translationKey: "displayFacts.supportedPlans",
        fallback: "Available plans",
      },
      values: ["Standard"],
    })
    expect(result.data[0]!.presentation).toMatchObject({
      summaryLayout: "inline",
      summaryFacts: [{ values: [label, "Standard"], currentValue: label }],
    })
    expect(result.data[0]!.price_metadata?.precision).toBe("exact")
    expect(result.data[0]!.pricingPlan?.source).toMatchObject({
      kind: "account",
      notes: [],
    })
    expect(result.data[1]!.model_descriptions).toBeUndefined()
    expect(result.data[1]!.price_metadata?.precision).toBe(
      restrictedChannels === 1 ? "exact" : "estimated",
    )
    expect(result.data[1]!.pricingPlan?.source).toMatchObject(
      restrictedChannels === 1
        ? {
            kind: "catalog",
            notes: [],
          }
        : {
            kind: "estimate",
            notes: [{ kind: "channel-minimum", scope: "catalog" }],
          },
    )
    expect(
      (await fetchPmplanModels(request)).map((model) => model.name),
    ).toEqual(["model-a"])
  },
)
it("loads only account-available models and preserves their native micro prices", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.get("https://plan.pmcat.top/api/models", () =>
      HttpResponse.json({
        models: [
          {
            name: "model-a",
            input_micro: 1000000,
            output_micro: 3000000,
            channel_count: 1,
          },
        ],
        plan: "lite",
      }),
    ),
  )
  expect(
    await fetchPmplanModels({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "pmplan_session=saved",
      },
    }),
  ).toEqual([
    {
      name: "model-a",
      input_micro: 1000000,
      output_micro: 3000000,
      channel_count: 1,
    },
  ])
})

it.each([
  [2500000, 7500000, 2.5, 7.5, 6.25],
  [0, 3000000, 0, 3, 1.5],
  [0, 0, 0, 0, 0],
])(
  "publishes eligible-channel minimum rates (%s/%s) as structured estimates",
  async (inputMicro, outputMicro, input, output, total) => {
    const { getSiteTypeCapabilities } =
      await import("~/services/apiAdapters/registry")
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    server.use(
      http.get("https://plan.pmcat.top/api/model-square", () =>
        HttpResponse.json({
          total: 1,
          available: 1,
          models: [
            {
              name: "model-a",
              input_micro: 0,
              output_micro: 0,
              channel_count: 1,
              available_now: true,
              tiers: ["lite"],
            },
          ],
        }),
      ),
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.get("https://plan.pmcat.top/api/models", () =>
        HttpResponse.json({
          models: [
            {
              name: "model-a",
              input_micro: inputMicro,
              output_micro: outputMicro,
              channel_count: 2,
            },
          ],
        }),
      ),
    )
    const pricing = getSiteTypeCapabilities("pmplan").account!.modelPricing
    expect(pricing).toBeDefined()
    const result = await pricing!.fetchPricing({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "pmplan_session=saved",
      },
    })
    expect(result.model_list_source?.supportsPricing).toBe(true)
    expect(result.data[0]!.pricingPlan?.rates).toEqual({
      input: { amount: input, currency: "USD", unit: "token", per: 1000000 },
      output: { amount: output, currency: "USD", unit: "token", per: 1000000 },
    })
    expect(result.data[0]!.pricingPlan?.issues).toEqual([])
    expect(result.data[0]!.pricingPlan?.source).toMatchObject({
      kind: "estimate",
      notes: [{ kind: "channel-minimum", scope: "account" }],
    })
    expect(result.data[0]!.price_metadata).toMatchObject({
      precision: "estimated",
    })
    expect(result.data[0]!.presentation?.summaryFacts?.[0]).not.toHaveProperty(
      "currentValue",
    )
    expect(result.data[0]!.model_descriptions).toBeUndefined()
    const quote = quoteCanonicalModelPrice(
      result.data[0]!,
      {
        purpose: "request",
        usage: { input: 1000000, output: 500000 },
      },
      {},
    )
    expect(quote).toMatchObject({
      status: "complete",
      amount: total,
      currency: "USD",
      source: {
        kind: "estimate",
        notes: [{ kind: "channel-minimum", scope: "account" }],
      },
    })
  },
)

it("discovers the selected runtime key's models using only its inference bearer credential", async () => {
  const { cookies } = installCookieTransport("pmplan_session", "plan.pmcat.top")
  const { getSiteTypeCapabilities } =
    await import("~/services/apiAdapters/registry")
  server.use(
    http.get("https://plan.pmcat.top/v1/models", ({ request }) => {
      expect(request.headers.get("authorization")).toBe(
        "Bearer sk-pm-runtime-test",
      )
      expect(request.headers.get("cookie")).toBeNull()
      return HttpResponse.json({ data: [{ id: "model-a" }] })
    }),
  )
  const catalog = getSiteTypeCapabilities("pmplan").account?.modelCatalog
  expect(catalog).toBeDefined()
  await expect(
    catalog!.fetchModels({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        cookie: "pmplan_session=console",
        apiKey: "sk-pm-runtime-test",
      },
    }),
  ).resolves.toEqual([{ id: "model-a" }])
  expect(cookies).not.toHaveBeenCalled()
})

it.each(["auth", "malformed"])(
  "does not substitute catalog prices after an eligible-model %s failure",
  async (failure) => {
    const { getSiteTypeCapabilities } =
      await import("~/services/apiAdapters/registry")
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.get("https://plan.pmcat.top/api/model-square", () =>
        HttpResponse.json({ total: 0, available: 0, models: [] }),
      ),
      http.get("https://plan.pmcat.top/api/models", () =>
        failure === "auth"
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({
              models: [{ name: "broken", input_micro: null }],
            }),
      ),
    )
    await expect(
      getSiteTypeCapabilities("pmplan").account!.modelPricing!.fetchPricing({
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "661",
          cookie: "pmplan_session=saved",
        },
      }),
    ).rejects.toThrow()
  },
)
