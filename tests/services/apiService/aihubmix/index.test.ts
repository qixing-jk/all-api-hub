import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  createApiToken,
  deleteApiToken,
  extractDefaultExchangeRate,
  fetchAccountAvailableModels,
  fetchAccountData,
  fetchAccountQuota,
  fetchAccountTokens,
  fetchAllModels,
  fetchCheckInStatus,
  fetchModelPricing,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchTodayIncome,
  fetchTodayUsage,
  fetchTokenById,
  fetchUserInfo,
  getOrCreateAccessToken,
  invalidateAIHubMixPublicCatalogs,
  refreshAccountData,
  resolveApiTokenKey,
  searchApiTokens,
  updateApiToken,
  validateAccountConnection,
} from "~/services/apiService/aihubmix"
import { createDeferredAbortDeadline } from "~/services/apiTransport/abortableTask"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import { MODEL_LIST_SOURCE_KINDS } from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_VIDEO_INPUTS,
} from "~/services/modelPricing/pricingConstants"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { resolveModelVendorCandidate } from "~/services/models/modelVendor"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
} from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { runMockSiteRequestTask } from "~~/tests/test-utils/siteRequestLease"

import additionalMediaFixtures from "./additionalMediaFixtures.json"
import diagnostic40 from "./diagnostic40Fixtures.json"
import reportedCatalogFixtures from "./reportedCatalogFixtures.json"
import taskBillingFixtures from "./taskBillingFixtures.json"

const { mockWithSiteApiRequestLimit } = vi.hoisted(() => ({
  mockWithSiteApiRequestLimit: vi.fn(),
}))

vi.mock(
  "~/services/apiTransport/siteRequestLimiter",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiTransport/siteRequestLimiter")
      >()
    return {
      ...actual,
      withSiteApiRequestLimit: mockWithSiteApiRequestLimit,
      withSiteApiRequestLease: mockWithSiteApiRequestLimit,
    }
  },
)

const baseRequest = {
  baseUrl: "https://aihubmix.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "7",
    accessToken: "system-access-token",
  },
}

const baseAccountRequest = {
  ...baseRequest,
  checkIn: buildCheckInConfig(),
}

const tokenRequest: CreateTokenRequest = {
  name: "temporary-key",
  remain_quota: 500000,
  expired_time: -1,
  unlimited_quota: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  group: "default",
}

describe("apiService AIHubMix", () => {
  beforeEach(() => {
    invalidateAIHubMixPublicCatalogs()
    server.resetHandlers()
    server.use(
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    )
    mockWithSiteApiRequestLimit.mockClear()
    mockWithSiteApiRequestLimit.mockImplementation(
      async (_key: string, task: () => any, _signal?: AbortSignal) =>
        await runMockSiteRequestTask(task),
    )
  })

  it("starts independent pricing sources before the public catalog completes", async () => {
    const started = new Set<string>()
    const catalogGate = createDeferred<void>()
    server.use(
      http.get("https://aihubmix.com/api/v1/models", async () => {
        started.add("catalog")
        await catalogGate.promise
        return HttpResponse.json({ success: true, data: [] })
      }),
      http.get("https://aihubmix.com/call/mdl_info", () => {
        started.add("website")
        return HttpResponse.json({ success: true, data: [] })
      }),
      http.get("https://aihubmix.com/api/user/available_models", () => {
        started.add("account")
        return HttpResponse.json({ success: true, data: [] })
      }),
    )
    const pending = fetchModelPricing(baseRequest)
    try {
      await vi.waitFor(() =>
        expect(started).toEqual(new Set(["catalog", "website", "account"])),
      )
    } finally {
      catalogGate.resolve()
      await pending
    }
  })

  it.each([true, false])(
    "publishes display capabilities with confirmed account scope: %s",
    async (hasAccountScope) => {
      server.use(
        http.get("https://aihubmix.com/api/v1/models", () =>
          HttpResponse.json({ success: true, data: [] }),
        ),
        http.get("https://aihubmix.com/api/user/available_models", () =>
          hasAccountScope
            ? HttpResponse.json({ success: true, data: [] })
            : HttpResponse.json({ success: false }, { status: 403 }),
        ),
        http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
          HttpResponse.json({ success: false }, { status: 403 }),
        ),
      )
      const response = await fetchModelPricing(baseRequest)
      expect(response.model_list_source).toMatchObject({
        catalogScope: hasAccountScope ? "personalized" : "provider",
        supportsPricing: true,
        actionPolicy: {
          supportsGroupFiltering: false,
          supportsAccountSummary: hasAccountScope,
          supportsTokenCompatibility: false,
          supportsCredentialVerification: false,
          supportsBatchCredentialVerification: false,
          supportsCliVerification: false,
        },
      })
    },
  )

  it("replays the forty-row diagnostic report with actual billing units", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({ success: true, data: diagnostic40.catalog }),
      ),
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({ success: true, data: diagnostic40.website }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          data: diagnostic40.catalog.map((row) => ({ model: row.model_id })),
        }),
      ),
    )
    const result = await fetchModelPricing(baseRequest)
    expect(result.data).toHaveLength(40)
    const images = new Set([
      "imagen-4.0",
      "imagen-4.0-ultra",
      "V_1",
      "V_1_TURBO",
      "V_2",
      "V_2_TURBO",
      "V_2A",
      "V_2A_TURBO",
      "dall-e-2",
      "dall-e-3",
      "DESCRIBE",
      "UPSCALE",
      "Stable-Diffusion-3-5-Large",
    ])
    const video = new Set([
      "sora-2",
      "sora-2-pro",
      "wan2.2-i2v-plus",
      "veo-3.0-generate-preview",
      "veo-3.1-generate-preview",
      "veo-3.1-fast-generate-preview",
      "veo-3.1-lite-generate-preview",
    ])
    const statuses: Record<string, number> = {}
    for (const model of result.data) {
      const quote = quoteCanonicalModelPrice(
        model,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          imageQuality: "Quality",
          inputTokens: 32000,
          outputTokens: 2000,
          videoQuality:
            model.model_name === "sora-2-pro" ? "720x1280" : "1080p",
          usage: { input: 80, output: 20 },
        },
        {},
      )
      statuses[quote.status] = (statuses[quote.status] ?? 0) + 1
      if (["paddleocr-vl-0.9b", "pp-structurev3"].includes(model.model_name))
        expect(quote).toMatchObject({
          status: "complete",
          unit: "page",
          amount: 0.025,
        })
      if (["flux-2-flex", "flux-2-pro"].includes(model.model_name))
        expect(quote).toMatchObject({
          status: "complete",
          unit: "megapixel",
          amount: model.model_name.endsWith("flex") ? 0.05 : 0.03,
        })
      if (model.model_name === "V3")
        expect(quote).toMatchObject({
          status: "complete",
          unit: "image",
          amount: 0.09,
        })
      if (model.model_name === "qwen3-vl-plus") {
        expect(quote.status).toBe("complete")
        expect(
          quote.lines.find((line) => line.meter === PRICING_METERS.INPUT)?.rate
            .amount,
        ).toBeCloseTo(0.137)
      }
      if (
        ["whisper-large-v3", "whisper-large-v3-turbo"].includes(
          model.model_name,
        )
      ) {
        expect(quote).toMatchObject({
          status: "complete",
          unit: "audio-second",
        })
        expect(quote.amount).toBeCloseTo(
          (model.model_name.endsWith("turbo") ? 0.044 : 0.111) / 3600,
        )
      }
      if (["glm-4.6", "glm-4.7", "doubao-seed-1-8"].includes(model.model_name))
        expect(quote.status, model.model_name).toBe("complete")
      if (images.has(model.model_name))
        expect(quote, model.model_name).toMatchObject({
          status: "complete",
          unit: "image",
        })
      if (video.has(model.model_name))
        expect(quote, model.model_name).toMatchObject({
          status: "complete",
          unit: "video-second",
        })
      if (["embed-v-4-0", "gemini-embedding-2"].includes(model.model_name)) {
        expect(quote.status, model.model_name).toBe("partial")
        expect(quote.issues).toContainEqual({
          code: "price-missing",
          meter: "output",
        })
        expect(
          quoteCanonicalModelPrice(
            model,
            { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1 } },
            {},
          ).status,
        ).toBe("complete")
      }
    }
    expect(statuses).toEqual({ complete: 31, partial: 2, unavailable: 7 })
  })

  it("quotes additional media and audio cache fields without legacy text fallbacks", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: additionalMediaFixtures.catalog,
        }),
      ),
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({
          success: true,
          data: additionalMediaFixtures.website,
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          data: additionalMediaFixtures.catalog.map((row) => ({
            model: row.model_id,
          })),
        }),
      ),
    )
    const response = await fetchModelPricing(baseRequest)
    expect(response.data).toHaveLength(6)
    for (const model of response.data) {
      const quote = quoteCanonicalModelPrice(
        model,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          videoQuality: "720p",
          videoInput: PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
          usage: { input: 80, output: 20 },
        },
        {},
      )
      if (model.model_name.includes("-mini-")) {
        expect(quote.issues).toContainEqual({ code: "source-conflict" })
        expect(quote.status).toBe("unavailable")
      } else {
        expect(quote.status, model.model_name).toBe("complete")
        if (model.model_name === "glm-image")
          expect(quote).toMatchObject({ unit: "image", amount: 0.015 })
        if (model.model_name.startsWith("doubao"))
          expect(quote.unit).toBe("video-second")
        if (model.model_name.startsWith("gemini")) {
          const audio = quoteCanonicalModelPrice(
            model,
            { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { audioCache: 1 } },
            {},
          )
          expect(audio.status).toBe("complete")
          expect(audio.amount).toBeCloseTo(0.1)
        }
      }
    }
  })

  it("quotes reported public catalog rows through the console account path", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: reportedCatalogFixtures.catalog,
        }),
      ),
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({
          success: true,
          data: reportedCatalogFixtures.website,
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          data: reportedCatalogFixtures.catalog.map((row) => ({
            model: row.model_id,
          })),
        }),
      ),
    )
    const result = await fetchModelPricing({
      ...baseRequest,
      baseUrl: "https://console.aihubmix.com",
    })
    expect(result.data).toHaveLength(13)
    for (const model of result.data) {
      const quote = quoteCanonicalModelPrice(
        model,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          inputTokens: 32000,
          outputTokens: 2000,
          at: "2026-09-09T12:00:00Z",
          usage: { input: 80, output: 20 },
        },
        {},
      )
      expect(quote.status, model.model_name).toBe(
        model.model_name === "auto" ? "unavailable" : "complete",
      )
    }
  })

  it("enriches only account models with public website rules and bilingual descriptions", async () => {
    let websiteRequests = 0
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              model_id: "qwen-flash",
              desc: "The model adopts tiered pricing.",
              pricing: { input: 0.02, output: 0.2, cache_read: 0.02 },
            },
            { model_id: "unavailable-model", pricing: { input: 1, output: 2 } },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({ success: true, data: [{ model: "qwen-flash" }] }),
      ),
      http.get("https://aihubmix.com/call/mdl_info", ({ request }) => {
        websiteRequests++
        expect(request.headers.has("Authorization")).toBe(false)
        expect(request.credentials).toBe("omit")
        return HttpResponse.json({
          success: true,
          data: [
            {
              model: "qwen-flash",
              desc: "该模型采取阶梯计费。",
              desc_en: "The model adopts tiered pricing.",
              billing_config: JSON.stringify({
                model_name: "qwen-flash",
                default_tier: "tier1",
                token_based_tier_configs: {
                  tier1: {
                    model_ratio: 0.010273,
                    completion_tokens_ratio: 10,
                    tier_condition: { min_tokens: 0, max_tokens: 128000 },
                  },
                  tier2: {
                    model_ratio: 0.041096,
                    completion_tokens_ratio: 10,
                    tier_condition: { min_tokens: 128001, max_tokens: 256000 },
                  },
                },
              }),
            },
          ],
        })
      }),
    )
    const result = await fetchModelPricing({
      ...baseRequest,
      baseUrl: "https://console.aihubmix.com",
    })
    expect(result.data.map((model) => model.model_name)).toEqual(["qwen-flash"])
    expect(websiteRequests).toBe(1)
    expect(result.data[0].model_descriptions).toEqual({
      zh: "该模型采取阶梯计费。",
      en: "The model adopts tiered pricing.",
    })
    const quote = quoteModelPrice(result.data[0].pricingPlan!, {
      purpose: PRICING_PURPOSES.REQUEST,
      inputTokens: 128001,
      usage: {
        input: 128001,
        output: 1000,
        cacheRead: 0,
        cacheWrite: 0,
        cacheWrite1h: 0,
      },
    })
    expect(quote.amount).toBeCloseTo(
      (128001 * 0.082192 + 1000 * 0.82192) / 1e6,
      10,
    )
    expect(quote.source.url).toBe(
      "https://aihubmix.com/model/qwen-flash#pricing",
    )
  })

  it("keeps video billing descriptions without falling back to legacy text prices", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              model_id: "example-video",
              pricing: { input: 2, output: 0, cache_read: 2 },
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          data: [{ model: "example-video" }],
        }),
      ),
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              model: "example-video",
              billing_config: JSON.stringify({
                metered_price_config: {
                  video_generation: {
                    unit: PRICE_RATE_UNITS.TOKEN,
                    fallback_unit_price: 10,
                  },
                },
                reserve_price_config: {
                  unit: PRICE_RATE_UNITS.REQUEST,
                  unit_price: 5,
                },
              }),
              display_input: "Input without video: $10.85 per million tokens",
              display_output: "输入不含视频：10.85美元/百万token",
            },
          ],
        }),
      ),
    )
    const result = await fetchModelPricing(baseRequest)
    const quote = quoteCanonicalModelPrice(
      result.data[0],
      { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1, output: 1 } },
      {},
    )
    expect(quote.unit).toBe("million-video-output-tokens")
    expect(quote.amount).toBeNull()
    expect(
      quote.publishedSchedule?.every(
        (rule) => Object.keys(rule.rates).length === 0,
      ),
    ).toBe(true)
    expect(quote.source.pricingDescription?.zh).toContain("10.85")
    expect(result.data[0].token_price_usd_per_million).toBeUndefined()
  })

  it("retains published rates but cannot certify them when website rules are unavailable", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: [
            { model_id: "qwen-flash", pricing: { input: 0.02, output: 0.2 } },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({ success: true, data: [{ model: "qwen-flash" }] }),
      ),
      http.get(
        "https://aihubmix.com/call/mdl_info",
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    const result = await fetchModelPricing(baseRequest)
    const quote = quoteModelPrice(result.data[0].pricingPlan!, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 1, output: 1 },
    })
    expect(quote.amount).toBeNull()
    expect(quote.source.rulesUnavailable).toBe(true)
    expect(quote.issues).toContainEqual({ code: "source-unavailable" })
    expect(quote.issues).not.toContainEqual({ code: "unsupported-rule" })
    expect(quote.publishedSchedule?.[0].rates.input?.amount).toBe(0.02)
    server.use(
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({
          success: true,
          data: [{ model: "qwen-flash", billing_config: "" }],
        }),
      ),
    )
    const recovered = await fetchModelPricing(baseRequest)
    expect(
      quoteCanonicalModelPrice(
        recovered.data[0],
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: { input: 1, output: 1 },
        },
        {},
      ).status,
    ).toBe("complete")
  })

  it("uses cached public task rules ahead of misleading legacy token rates", async () => {
    const fixtures = taskBillingFixtures.filter((row) =>
      ["qwen-audio-3.0-tts-flash", "minimax-h3", "wan3.0-video"].includes(
        row.model,
      ),
    )
    let websiteRequests = 0
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: fixtures.map((row) => ({
            model_id: row.model,
            pricing: { input: 2, output: 0 },
          })),
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          data: fixtures.map(({ model }) => ({ model })),
        }),
      ),
      http.get("https://aihubmix.com/call/mdl_info", () => {
        websiteRequests++
        return HttpResponse.json({
          success: true,
          data: fixtures.map((row) => ({
            model: row.model,
            billing_config: row.billing,
            img_price_config: row.legacy,
            display_input: row.note,
          })),
        })
      }),
    )
    const result = await fetchModelPricing(baseRequest)
    const quotes = new Map(
      result.data.map((model) => [
        model.model_name,
        quoteCanonicalModelPrice(
          model,
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            videoQuality: "720P",
            usage: { input: 1, output: 1 },
          },
          {},
        ),
      ]),
    )
    expect(quotes.get("qwen-audio-3.0-tts-flash")).toMatchObject({
      unit: "thousand-characters",
      amount: 0.0141,
      status: "complete",
    })
    expect(quotes.get("wan3.0-video")).toMatchObject({
      unit: "video-second",
      amount: 0.0845,
      status: "complete",
    })
    expect(quotes.get("minimax-h3")).toMatchObject({
      status: "unavailable",
      issues: [{ code: "source-conflict" }],
    })
    await fetchModelPricing(baseRequest)
    expect(websiteRequests).toBe(1)
  })

  it("retains routing price notes when no executable website rule exists", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: [{ model_id: "router", pricing: { input: 2, output: 2 } }],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({ success: true, data: [{ model: "router" }] }),
      ),
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              model: "router",
              billing_config: "",
              display_input: "Charged by the routed model.",
              display_output: "按实际命中模型计费。",
            },
          ],
        }),
      ),
    )
    const result = await fetchModelPricing(baseRequest)
    const quote = quoteModelPrice(result.data[0].pricingPlan!, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: { input: 1 },
    })
    expect(quote).toMatchObject({
      status: "unavailable",
      amount: null,
      source: {
        pricingDescription: {
          en: "Charged by the routed model.",
          zh: "按实际命中模型计费。",
        },
      },
    })
  })

  it("uses the app default exchange rate because AIHubMix exposes no site rate field", () => {
    expect(extractDefaultExchangeRate(null)).toBe(
      UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
    )
    expect(
      extractDefaultExchangeRate({
        system_name: "AIHubMix",
        checkin_enabled: false,
      }),
    ).toBe(UI_CONSTANTS.EXCHANGE_RATE.DEFAULT)
  })

  it("returns static metadata and no built-in daily/check-in metrics", async () => {
    await expect(fetchSiteStatus(baseRequest)).resolves.toEqual({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    await expect(fetchSupportCheckIn(baseRequest)).resolves.toBe(false)
    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
    await expect(fetchTodayUsage(baseRequest)).resolves.toEqual({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    })
    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 0,
      todayStatsAvailability: {
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    })
  })

  it("returns independent availability snapshots", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { username: "example-user", quota: 100 },
        }),
      ),
    )

    const first = await fetchAccountData(baseAccountRequest)
    first.todayStatsAvailability!.consumption.status =
      ACCOUNT_TODAY_METRIC_STATUSES.Complete

    const second = await fetchAccountData(baseAccountRequest)

    expect(second.todayStatsAvailability!.consumption).toEqual({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
    })
    expect(second.todayStatsAvailability).not.toBe(first.todayStatsAvailability)
    expect(second.todayStatsAvailability!.consumption).not.toBe(
      first.todayStatsAvailability!.consumption,
    )
  })

  it("builds the vendor invite URL from the saved-account user response", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("system-access-token")
        expect(request.headers.get("Cookie")).toBeNull()

        return HttpResponse.json({
          success: true,
          data: {
            username: "invite-user",
            aff_code: "  invite-code  ",
          },
        })
      }),
    )

    const apiService = (await import(
      "~/services/apiService/aihubmix"
    )) as Record<string, unknown>
    const fetchInviteLink = apiService.fetchInviteLink as
      | ((request: typeof baseRequest) => Promise<string>)
      | undefined

    expect(fetchInviteLink).toEqual(expect.any(Function))
    await expect(fetchInviteLink!(baseRequest)).resolves.toBe(
      "https://aihubmix.com/?aff=invite-code",
    )
  })

  it("disables caching when fetching the invite link", async () => {
    let requestCache: RequestCache | undefined
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        requestCache = request.cache

        return HttpResponse.json({
          success: true,
          data: { aff_code: "invite-code" },
        })
      }),
    )

    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await fetchInviteLink(baseRequest)

    expect(requestCache).toBe("no-store")
  })

  it("admits the raw invite-link request through the site limiter once", async () => {
    const abortController = new AbortController()
    const startDeadline = vi.fn()
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: { aff_code: "invite-code" },
        }),
      ),
    )
    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await fetchInviteLink({
      ...baseRequest,
      abortSignal: abortController.signal,
      abortDeadline: {
        signal: abortController.signal,
        start: startDeadline,
        dispose: vi.fn(),
      },
    })

    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledTimes(1)
    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
      "https://aihubmix.com",
      expect.any(Function),
      abortController.signal,
    )
    expect(startDeadline).toHaveBeenCalledTimes(1)
  })

  it("does not start the native deadline for a pre-aborted dispatch", async () => {
    const abortController = new AbortController()
    const startDeadline = vi.fn()
    abortController.abort(new DOMException("Cancelled", "AbortError"))
    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await expect(
      fetchInviteLink({
        ...baseRequest,
        abortSignal: abortController.signal,
        abortDeadline: {
          signal: abortController.signal,
          start: startDeadline,
          dispose: vi.fn(),
        },
      }),
    ).rejects.toBe(abortController.signal.reason)

    expect(startDeadline).not.toHaveBeenCalled()
  })

  it("aborts the native invite-link request when only its shared deadline expires", async () => {
    vi.useFakeTimers()
    const abortDeadline = createDeferredAbortDeadline(1_000)
    let receivedSignal: AbortSignal | null | undefined
    let settleFetch: (() => void) | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, options) => {
        receivedSignal = options?.signal
        return new Promise<Response>((resolve, reject) => {
          settleFetch = () => resolve(new Response("late response"))
          receivedSignal?.addEventListener(
            "abort",
            () => reject(receivedSignal?.reason),
            { once: true },
          )
        })
      })

    try {
      const { fetchInviteLink } = await import("~/services/apiService/aihubmix")
      const request = fetchInviteLink({ ...baseRequest, abortDeadline })
      void request.catch(() => undefined)

      await vi.advanceTimersByTimeAsync(0)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
        "https://aihubmix.com",
        expect.any(Function),
        abortDeadline.signal,
      )

      await vi.advanceTimersByTimeAsync(1_000)
      expect(receivedSignal?.aborted).toBe(true)
      await expect(request).rejects.toMatchObject({ name: "TimeoutError" })
    } finally {
      abortDeadline.dispose()
      settleFetch?.()
      fetchSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("starts the native invite-link timeout after site-limiter dispatch", async () => {
    vi.useFakeTimers()
    const abortController = new AbortController()
    let dispatchRequest: (() => void) | undefined
    let completeFetch: (() => void) | undefined
    let underlyingCompletion: Promise<unknown> | undefined
    let underlyingCompleted = false
    let receivedSignal: AbortSignal | null | undefined
    let requestError: unknown
    let requestSettled: Promise<void> | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, options) => {
        receivedSignal = options?.signal

        return new Promise<Response>((resolve) => {
          completeFetch = () =>
            resolve(
              new Response(
                JSON.stringify({
                  success: true,
                  data: { aff_code: "late-code" },
                  message: "ok",
                }),
                { headers: { "content-type": "application/json" } },
              ),
            )
        })
      })

    mockWithSiteApiRequestLimit.mockImplementation(
      async (_key: string, task: () => any) =>
        await new Promise<unknown>((resolve, reject) => {
          dispatchRequest = () => {
            dispatchRequest = undefined
            const dispatched = task()
            underlyingCompletion = dispatched?.completion
            void underlyingCompletion?.then(() => {
              underlyingCompleted = true
            })
            void (dispatched?.result ?? dispatched).then(resolve, reject)
          }
        }),
    )

    try {
      const { fetchInviteLink } = await import("~/services/apiService/aihubmix")
      requestSettled = fetchInviteLink({
        ...baseRequest,
        abortSignal: abortController.signal,
        requestTimeoutMs: 1_000,
      }).then(
        () => undefined,
        (error) => {
          requestError = error
        },
      )

      await vi.advanceTimersByTimeAsync(1_000)
      expect(fetchSpy).not.toHaveBeenCalled()

      dispatchRequest?.()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(999)
      expect(receivedSignal?.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      expect(receivedSignal?.aborted).toBe(true)
      await requestSettled
      expect(requestError).toMatchObject({ name: "TimeoutError" })
      expect(underlyingCompleted).toBe(false)

      completeFetch?.()
      await underlyingCompletion
      expect(underlyingCompleted).toBe(true)
    } finally {
      dispatchRequest?.()
      abortController.abort()
      completeFetch?.()
      await underlyingCompletion
      await requestSettled
      fetchSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("forwards invite-link cancellation to the native request", async () => {
    const abortController = new AbortController()
    let receivedSignal: AbortSignal | null | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce((_input, options) => {
        receivedSignal = options?.signal

        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        })
      })

    try {
      const apiService = (await import(
        "~/services/apiService/aihubmix"
      )) as Record<string, unknown>
      const fetchInviteLink = apiService.fetchInviteLink as
        | ((
            request: typeof baseRequest & { abortSignal: AbortSignal },
          ) => Promise<string>)
        | undefined
      const inviteLinkPromise = fetchInviteLink!({
        ...baseRequest,
        abortSignal: abortController.signal,
      })

      await vi.waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1)
      })
      abortController.abort()

      await expect(inviteLinkPromise).rejects.toMatchObject({
        name: "AbortError",
      })
      expect(receivedSignal).toBe(abortController.signal)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it.each([
    {
      caseName: "null data",
      response: { success: true, data: null },
    },
    {
      caseName: "missing data",
      response: { success: true },
    },
    {
      caseName: "array data",
      response: { success: true, data: [] },
    },
    {
      caseName: "non-string code",
      response: { success: true, data: { aff_code: 42 } },
    },
    {
      caseName: "blank code",
      response: { success: true, data: { aff_code: "   " } },
    },
  ])(
    "rejects malformed AIHubMix invitation payloads: $caseName",
    async ({ response }) => {
      server.use(
        http.get("https://aihubmix.com/api/user/self", () =>
          HttpResponse.json(response),
        ),
      )

      const apiService = (await import(
        "~/services/apiService/aihubmix"
      )) as Record<string, unknown>
      const fetchInviteLink = apiService.fetchInviteLink as
        | ((request: typeof baseRequest) => Promise<string>)
        | undefined

      expect(fetchInviteLink).toEqual(expect.any(Function))
      await expect(fetchInviteLink!(baseRequest)).rejects.toMatchObject({
        reason: INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
      })
    },
  )

  it("classifies malformed AIHubMix envelopes as invalid responses", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(null),
      ),
    )

    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await expect(fetchInviteLink(baseRequest)).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })

  it("normalizes invalid numbers, empty access tokens, and direct data bodies", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json([
          {
            id: "bad-id",
            user_id: "bad-user-id",
            key: "direct-key",
            status: "bad-status",
            name: 123,
            created_time: "bad-created",
            accessed_time: "bad-accessed",
            expired_time: "bad-expired",
            remain_quota: "bad-quota",
            used_quota: "bad-used",
            unlimited_quota: false,
            model_limits: 123,
            models: ["not", "a", "string"],
            allow_ips: 123,
            ip_whitelist: 456,
            subnet: 789,
            group: 123,
          },
        ]),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).resolves.toEqual([
      expect.objectContaining({
        id: 0,
        user_id: 0,
        key: "direct-key",
        status: 1,
        name: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        used_quota: 0,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        group: undefined,
      }),
    ])

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        auth: { ...baseRequest.auth, accessToken: null as any },
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.HTTP_401,
    })
  })

  it("trims access tokens and treats blank string fields as empty normalized values", async () => {
    let capturedAuthorization: string | null = null
    server.use(
      http.get("https://aihubmix.com/api/token/", ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              id: "42",
              user_id: "7",
              key: "",
              name: "blank-compatible",
              status: 1,
              created_time: "  ",
              accessed_time: "  ",
              expired_time: "  ",
              remain_quota: "  ",
              used_quota: "  ",
              unlimited_quota: false,
              models: "gpt-4o",
              subnet: "192.168.0.0/24",
            },
          ],
        })
      }),
    )

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        auth: { ...baseRequest.auth, accessToken: "  trimmed-token  " },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 42,
        user_id: 7,
        key: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        used_quota: 0,
        model_limits_enabled: true,
        model_limits: "gpt-4o",
        allow_ips: "192.168.0.0/24",
      }),
    ])
    expect(capturedAuthorization).toBe("trimmed-token")
  })

  it("fetches cookie-authenticated user info from /call/usr/self", async () => {
    let capturedCookieAuth = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", ({ request }) => {
        capturedCookieAuth = request.credentials === "include"
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
            quota: 900000,
            used_quota: 12345,
          },
        })
      }),
    )

    const userInfo = await fetchUserInfo({
      baseUrl: "https://aihubmix.com",
      auth: { authType: AuthTypeEnum.Cookie },
    })

    expect(capturedCookieAuth).toBe(true)
    expect(userInfo).toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
  })

  it("uses AIHubMix's documented message for cookie-session failures", async () => {
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "AIHubMix rejected the account session",
            data: null,
          },
          { status: 401 },
        ),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "AIHubMix rejected the account session",
    })
  })

  it("falls back to the shared msg heuristic for an unrecognized AIHubMix error", async () => {
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          { success: false, msg: "legacy guessed message", data: null },
          { status: 400 },
        ),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "legacy guessed message",
    })
  })

  it("uses username as the stable cookie-authenticated account identity when AIHubMix omits id", async () => {
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
          },
        }),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
  })

  it("fetches cookie user info from the main web origin for console.aihubmix.com", async () => {
    let mainOriginUserInfoCalled = false
    let consoleOriginUserInfoCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () => {
        mainOriginUserInfoCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        })
      }),
      http.get("https://console.aihubmix.com/call/usr/self", () => {
        consoleOriginUserInfoCalled = true
        return HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        )
      }),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://console.aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(consoleOriginUserInfoCalled).toBe(false)
  })

  it("fetches access-token user info from /api/user/self with raw Authorization", async () => {
    let capturedAuthorization: string | null = null
    let mainOriginUserInfoCalled = false
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        mainOriginUserInfoCalled = true
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
            quota: 900000,
          },
        })
      }),
      http.get("https://console.aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong auth endpoint",
            data: null,
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://console.aihubmix.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "system-access-token",
        },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(capturedAuthorization).toBe("system-access-token")
  })

  it("uses existing access_token from /call/usr/self before fetching the console token", async () => {
    let consoleTokenCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
          },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/tkn", () => {
        consoleTokenCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: "created-access-token",
        })
      }),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
    expect(consoleTokenCalled).toBe(false)
  })

  it("fetches the console access token when /call/usr/self has no usable token", async () => {
    let consoleTokenRequestUrl: string | null = null
    let capturedCookieAuth = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/tkn", ({ request }) => {
        consoleTokenRequestUrl = request.url
        capturedCookieAuth = request.credentials === "include"
        return HttpResponse.json({
          success: true,
          message: "",
          data: "created-access-token",
        })
      }),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "created-access-token",
    })
    expect(capturedCookieAuth).toBe(true)
    expect(consoleTokenRequestUrl).toContain(
      "https://aihubmix.com/call/usr/tkn",
    )
    expect(consoleTokenRequestUrl).toContain("_t=")
  })

  it("fetches the console access token from the main API origin for console.aihubmix.com", async () => {
    let mainOriginUserInfoCalled = false
    let mainOriginTokenCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () => {
        mainOriginUserInfoCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        })
      }),
      http.get("https://aihubmix.com/call/usr/tkn", () => {
        mainOriginTokenCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: "main-origin-access-token",
        })
      }),
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "api user self requires access token",
            data: null,
          },
          { status: 401 },
        ),
      ),
      http.get("https://console.aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://console.aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://console.aihubmix.com/call/usr/tkn", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: "",
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://console.aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "main-origin-access-token",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(mainOriginTokenCalled).toBe(true)
  })

  it("sends saved-token management calls with raw Authorization token", async () => {
    let capturedAuthorization: string | null = null
    server.use(
      http.get("https://aihubmix.com/api/token/", ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              id: 1,
              user_id: 7,
              key: "plain-key",
              name: "test-key",
              status: 1,
              created_time: 100,
              accessed_time: 200,
              expired_time: -1,
              remain_quota: "500000",
              unlimited_quota: false,
              used_quota: "1000",
              model_limits: "gpt-4o",
              allow_ips: "127.0.0.1",
            },
          ],
        })
      }),
    )

    const tokens = await fetchAccountTokens(baseRequest)

    expect(capturedAuthorization).toBe("system-access-token")
    expect(tokens).toEqual([
      expect.objectContaining({
        id: 1,
        key: "plain-key",
        name: "test-key",
        remain_quota: 500000,
        used_quota: 1000,
        model_limits: "gpt-4o",
        allow_ips: "127.0.0.1",
      }),
    ])
  })

  it("rejects saved-token calls without an access token before network requests", async () => {
    let tokenEndpointCalled = false
    server.use(
      http.get("https://aihubmix.com/api/token/", () => {
        tokenEndpointCalled = true
        return HttpResponse.json({ success: true, message: "", data: [] })
      }),
    )

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        auth: { ...baseRequest.auth, accessToken: "   " },
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: API_ERROR_CODES.HTTP_401,
    })
    expect(tokenEndpointCalled).toBe(false)
  })

  it("sends saved-token management calls to the main API origin for console.aihubmix.com", async () => {
    let mainOriginTokenListCalled = false
    server.use(
      http.get("https://aihubmix.com/api/token/", () => {
        mainOriginTokenListCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [],
        })
      }),
      http.get("https://console.aihubmix.com/api/token/", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: [],
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        baseUrl: "https://console.aihubmix.com",
      }),
    ).resolves.toEqual([])
    expect(mainOriginTokenListCalled).toBe(true)
  })

  it("searches API keys through /api/token/search with keyword query", async () => {
    let capturedAuthorization: string | null = null
    let capturedKeyword: string | null = null
    server.use(
      http.get("https://aihubmix.com/api/token/search", ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        capturedKeyword = new URL(request.url).searchParams.get("keyword")
        return HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              id: 9,
              user_id: 7,
              key: "searched-key",
              name: "search match",
              status: 1,
              created_time: 100,
              accessed_time: 200,
              expired_time: -1,
              remain_quota: 500000,
              unlimited_quota: false,
              used_quota: 1000,
            },
          ],
        })
      }),
    )

    const tokens = await searchApiTokens(baseRequest, "temporary key")

    expect(capturedAuthorization).toBe("system-access-token")
    expect(capturedKeyword).toBe("temporary key")
    expect(tokens).toEqual([
      expect.objectContaining({
        id: 9,
        key: "searched-key",
        name: "search match",
      }),
    ])
  })

  it("keeps cumulative used quota out of today statistics", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: "900000",
            used_quota: "12345",
          },
        }),
      ),
    )

    const accountData = await fetchAccountData({
      ...baseRequest,
      siteType: SITE_TYPES.AIHUBMIX,
      checkIn: baseAccountRequest.checkIn,
    })

    expect(accountData).toMatchObject({
      quota: 900000,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
      checkIn: baseAccountRequest.checkIn,
    })
  })

  it("fetches raw account quota and validates connection health", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: "900000",
          },
        }),
      ),
    )

    await expect(fetchAccountQuota(baseRequest)).resolves.toBe(900000)
    await expect(validateAccountConnection(baseRequest)).resolves.toBe(true)
  })

  it("maps refresh and connection failures to shared health/failure shapes", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "bad access token",
            data: null,
          },
          { status: 401 },
        ),
      ),
    )

    await expect(refreshAccountData(baseAccountRequest)).resolves.toMatchObject(
      {
        success: false,
        healthStatus: {
          message: "account:healthStatus.httpError",
        },
      },
    )
    await expect(validateAccountConnection(baseRequest)).resolves.toBe(false)
  })

  it("reports healthy refresh data when the account read succeeds", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: 500000,
            used_quota: 1000,
          },
        }),
      ),
    )

    await expect(refreshAccountData(baseAccountRequest)).resolves.toMatchObject(
      {
        success: true,
        data: {
          quota: 500000,
          today_quota_consumption: 0,
        },
        healthStatus: {
          status: "healthy",
          message: "account:healthStatus.normal",
        },
      },
    )
  })

  it("maps token detail, create, update, and delete to documented endpoints", async () => {
    const calls: Array<{ method: string; pathname: string; body?: any }> = []

    server.use(
      http.get("https://aihubmix.com/api/token/:id", ({ params, request }) => {
        calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
        })
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: Number(params.id),
            key: "detail-key",
            name: "detail",
            status: 1,
            created_time: 1,
            accessed_time: 2,
            expired_time: -1,
            remain_quota: 100,
            unlimited_quota: false,
            used_quota: 0,
          },
        })
      }),
      http.post("https://aihubmix.com/api/token/", async ({ request }) => {
        calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.json(),
        })
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 271585,
            user_id: 152534,
            key: "sk-test****fake",
            status: 1,
            name: "11",
            created_time: 1778417169,
            accessed_time: 1778417169,
            expired_time: -1,
            remain_quota: -1,
            unlimited_quota: true,
            used_quota: 0,
            models: null,
            subnet: "",
            full_key: "sk-test-00000000000000000000000000000000",
          },
        })
      }),
      http.put("https://aihubmix.com/api/token/", async ({ request }) => {
        calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.json(),
        })
        return HttpResponse.json({ success: true, message: "", data: true })
      }),
      http.delete("https://aihubmix.com/api/token/:id", ({ request }) => {
        calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
        })
        return HttpResponse.json({ success: true, message: "", data: true })
      }),
    )

    await expect(fetchTokenById(baseRequest, 12)).resolves.toMatchObject({
      id: 12,
      key: "detail-key",
    })
    await expect(createApiToken(baseRequest, tokenRequest)).resolves.toEqual(
      expect.objectContaining({
        id: 271585,
        user_id: 152534,
        key: "sk-test-00000000000000000000000000000000",
        name: "11",
      }),
    )
    await expect(updateApiToken(baseRequest, 12, tokenRequest)).resolves.toBe(
      true,
    )
    await expect(deleteApiToken(baseRequest, 12)).resolves.toBe(true)

    expect(calls).toEqual([
      { method: "GET", pathname: "/api/token/12" },
      {
        method: "POST",
        pathname: "/api/token/",
        body: {
          name: tokenRequest.name,
          expired_time: tokenRequest.expired_time,
          unlimited_quota: tokenRequest.unlimited_quota,
          remain_quota: tokenRequest.remain_quota,
          models: "",
          subnet: "",
        },
      },
      {
        method: "PUT",
        pathname: "/api/token/",
        body: {
          id: 12,
          name: tokenRequest.name,
          expired_time: tokenRequest.expired_time,
          unlimited_quota: tokenRequest.unlimited_quota,
          remain_quota: tokenRequest.remain_quota,
          models: "",
          subnet: "",
        },
      },
      { method: "DELETE", pathname: "/api/token/12" },
    ])
  })

  it("maps common form model and IP fields to AIHubMix create-key fields", async () => {
    let createPayload: unknown = null
    server.use(
      http.post("https://aihubmix.com/api/token/", async ({ request }) => {
        createPayload = await request.json()
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 20,
            user_id: 7,
            key: "sk-created",
            name: "model-limited",
            status: 1,
            created_time: 1,
            accessed_time: 1,
            expired_time: -1,
            remain_quota: -1,
            unlimited_quota: true,
            used_quota: 0,
            models: "gpt-4o,claude-3-5-sonnet",
            subnet: "127.0.0.1",
          },
        })
      }),
    )

    await expect(
      createApiToken(baseRequest, {
        ...tokenRequest,
        name: "model-limited",
        remain_quota: 123,
        unlimited_quota: true,
        model_limits_enabled: true,
        model_limits: "gpt-4o,claude-3-5-sonnet",
        allow_ips: "127.0.0.1",
        group: "ignored-group",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 20,
        model_limits: "gpt-4o,claude-3-5-sonnet",
        model_limits_enabled: true,
        allow_ips: "127.0.0.1",
      }),
    )

    expect(createPayload).toEqual({
      name: "model-limited",
      expired_time: -1,
      unlimited_quota: true,
      remain_quota: -1,
      models: "gpt-4o,claude-3-5-sonnet",
      subnet: "127.0.0.1",
    })
  })

  it("normalizes missing IP limits to an empty subnet", async () => {
    let createPayload: unknown = null
    server.use(
      http.post("https://aihubmix.com/api/token/", async ({ request }) => {
        createPayload = await request.json()
        return HttpResponse.json({ success: true, message: "", data: true })
      }),
    )

    await expect(
      createApiToken(baseRequest, {
        ...tokenRequest,
        allow_ips: undefined as any,
      }),
    ).resolves.toBe(true)

    expect(createPayload).toEqual({
      name: tokenRequest.name,
      expired_time: tokenRequest.expired_time,
      unlimited_quota: tokenRequest.unlimited_quota,
      remain_quota: tokenRequest.remain_quota,
      models: "",
      subnet: "",
    })
  })

  it("uses a localized fallback message for HTTP errors without response messages", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json(
          { success: false, message: "   ", data: null },
          { status: 401 },
        ),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).rejects.toMatchObject({
      statusCode: 401,
      message: "messages:errors.api.requestFailed",
    })
  })

  it("does not try to reveal masked keys through unsupported detail endpoints", async () => {
    let revealCalled = false
    let detailCalled = false
    server.use(
      http.post("https://aihubmix.com/api/token/:id/key", () => {
        revealCalled = true
        return HttpResponse.json(
          { success: false, message: "unsupported" },
          { status: 500 },
        )
      }),
      http.get("https://aihubmix.com/api/token/:id", () => {
        detailCalled = true
        return HttpResponse.json(
          { success: false, message: "detail is not a secret endpoint" },
          { status: 500 },
        )
      }),
    )

    await expect(
      resolveApiTokenKey(baseRequest, {
        id: 12,
        key: "sk-abcd************wxyz",
      } as any),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
      message: "messages:errors.tokenSecretUnavailable",
    })
    expect(revealCalled).toBe(false)
    expect(detailCalled).toBe(false)
  })

  it("passes through usable AIHubMix keys without reveal requests", async () => {
    let revealCalled = false
    let detailCalled = false
    server.use(
      http.post("https://aihubmix.com/api/token/:id/key", () => {
        revealCalled = true
        return HttpResponse.json({ success: false, message: "unsupported" })
      }),
      http.get("https://aihubmix.com/api/token/:id", () => {
        detailCalled = true
        return HttpResponse.json({
          success: false,
          message: "detail is not a secret endpoint",
        })
      }),
    )

    await expect(
      resolveApiTokenKey(baseRequest, {
        id: 12,
        key: "plain-key",
      } as any),
    ).resolves.toBe("plain-key")
    expect(revealCalled).toBe(false)
    expect(detailCalled).toBe(false)
  })

  it("normalizes available model response variants to model id strings", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model: "gpt-4o", developer_id: 1, order: 10 },
            { model: "gpt-4o-mini", developer_id: 1, order: 20 },
            { model: "claude-3-5-sonnet", developer_id: 2, order: 30 },
          ],
        }),
      ),
    )

    await expect(fetchAccountAvailableModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3-5-sonnet",
    ])
  })

  it("trims and de-duplicates user-scoped model ids", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            " gpt-4o ",
            { model: "gpt-4o" },
            { id: " claude-3-5-sonnet " },
            " ",
          ],
        }),
      ),
    )

    await expect(fetchAccountAvailableModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
  })

  it("normalizes catalog model response variants", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-4o" },
            { id: "gpt-4o-mini" },
            { name: "claude-3-5-sonnet" },
            { id: 123 },
          ],
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3-5-sonnet",
    ])
  })

  it("trims and de-duplicates global catalog model ids", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: " gpt-4o " },
            { id: "gpt-4o" },
            { name: " claude-3-5-sonnet " },
            { model_id: " " },
          ],
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
  })

  it("quotes published promotion windows once, including full-day and weekly midnight ownership", async () => {
    server.use(
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({
          success: true,
          data: [{ model: "glm-5.2", billing_config: "" }],
        }),
      ),
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              model_id: "glm-5.2",
              pricing: { input: 1.1268, output: 3.9438 },
              promotion: {
                off_percent: 36,
                time_type: "weekly",
                weekly: [{ weekdays: [1], ranges: ["22:00-02:00"] }],
              },
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({ success: true, data: [{ model: "glm-5.2" }] }),
      ),
    )
    const response = await fetchModelPricing(baseRequest)
    const quote = (at: string) =>
      quoteCanonicalModelPrice(
        response.data[0],
        { purpose: PRICING_PURPOSES.TOKEN_INDEX, at, usage: { input: 1 } },
        { groupMultiplier: 1 },
      )
    expect(quote("2026-09-08T01:59:00Z").amount).toBeCloseTo(0.721152)
    expect(quote("2026-09-08T02:00:00Z").amount).toBe(1.1268)
    expect(quote("2026-09-07T01:00:00Z").amount).toBe(1.1268)
  })

  it("maps AIHubMix /api/v1/models catalog prices as direct USD per 1M token prices", async () => {
    let legacyModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_id: "gemini-3.5-flash",
              desc: "Fast Gemini model",
              developer_id: 8,
              developer_name: "Google",
              endpoints: ["chat"],
              pricing: {
                cache_read: 1.5,
                input: 1.5,
                output: 9,
              },
            },
            {
              model_id: "claude-3-5-sonnet",
              desc: "Anthropic model",
              developer_id: 2,
              developer_name: "Anthropic",
              endpoints: ["chat"],
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gemini-3.5-flash", developer_id: 8, order: 10 }],
        }),
      ),
      http.get("https://aihubmix.com/api/models", () => {
        legacyModelsCalled = true
        return HttpResponse.json({ success: true, message: "", data: {} })
      }),
    )

    const result = await fetchModelPricing(baseRequest)

    expect(result).toMatchObject({
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
        provider: SITE_TYPES.AIHUBMIX,
      },
      data: [
        {
          model_name: "gemini-3.5-flash",
          model_description: "Fast Gemini model",
          owner_by: "Google",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Google",
            externalId: "8",
          },
          model_price: 0,
          quota_type: 0,
          enable_groups: [],
          supported_endpoint_types: ["chat"],
          token_price_usd_per_million: {
            cache_read: 1.5,
            input: 1.5,
            output: 9,
          },
        },
      ],
    })
    expect(calculateModelPrice(result.data[0], 1)).toMatchObject({
      kind: "token",
      usdPerMillionTokens: { input: 1.5, output: 9 },
    })
    expect(legacyModelsCalled).toBe(false)
  })

  it("prefers a non-empty developer name over developer and routing owner metadata", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_id: "precedence-model",
              developer_name: " Example Primary Publisher ",
              developer: "Example Secondary Publisher",
              owner_by: "Example Router",
              developer_id: "primary-publisher-id",
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "precedence-model" }],
        }),
      ),
    )

    const result = await fetchModelPricing(baseRequest)

    expect(result.data[0].vendorEvidence).toEqual({
      kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
      name: "Example Primary Publisher",
      externalId: "primary-publisher-id",
    })
  })

  it("falls back from /api/user/available_models to /call/usr/avail_mdls for user-scoped AIHubMix models", async () => {
    let webAvailableModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-web-scope", desc: "Web scope model" },
            { model_id: "gpt-catalog-only", desc: "Catalog only model" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          { success: false, message: "removed", data: [] },
          { status: 404 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () => {
        webAvailableModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gpt-web-scope", developer_id: 1, order: 1 }],
        })
      }),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(webAvailableModelsCalled).toBe(true)
    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data.map((model) => model.model_name)).toEqual([
      "gpt-web-scope",
    ])
  })

  it("falls through from malformed API user scope to valid web user scope", async () => {
    let webAvailableModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-web-scope", desc: "Web scope model" },
            { model_id: "gpt-catalog-only", desc: "Catalog only model" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { unexpected: true },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () => {
        webAvailableModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gpt-web-scope", developer_id: 1, order: 1 }],
        })
      }),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(webAvailableModelsCalled).toBe(true)
    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data.map((model) => model.model_name)).toEqual([
      "gpt-web-scope",
    ])
  })

  it("accepts recognized object wrappers for AIHubMix user scope", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-wrapper-scope", desc: "Wrapper scope model" },
            { model_id: "gpt-catalog-only", desc: "Catalog only model" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            models: [{ model: "gpt-wrapper-scope", developer_id: 1 }],
          },
        }),
      ),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data.map((model) => model.model_name)).toEqual([
      "gpt-wrapper-scope",
    ])
  })

  it("falls through from unrecognized API user scope array fields to valid web user scope", async () => {
    let webAvailableModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-web-scope", desc: "Web scope model" },
            { model_id: "gpt-catalog-only", desc: "Catalog only model" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { unexpected: [] },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () => {
        webAvailableModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gpt-web-scope", developer_id: 1, order: 1 }],
        })
      }),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(webAvailableModelsCalled).toBe(true)
    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data.map((model) => model.model_name)).toEqual([
      "gpt-web-scope",
    ])
  })

  it("uses the full AIHubMix catalog with fallback metadata when user-scoped endpoints fail", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-catalog-a", desc: "Catalog model A" },
            { model_id: "gpt-catalog-b", desc: "Catalog model B" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          { success: false, message: "removed", data: [] },
          { status: 404 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
        HttpResponse.json(
          { success: false, message: "not authenticated", data: [] },
          { status: 401 },
        ),
      ),
    )

    await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        provider: SITE_TYPES.AIHUBMIX,
      },
      data: [
        { model_name: "gpt-catalog-a", enable_groups: [] },
        { model_name: "gpt-catalog-b", enable_groups: [] },
      ],
    })
  })

  it("keeps the public ID-only catalog shape evidence-free for downstream curated fallback", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_id: "gpt-4o",
              desc: "Public catalog model",
              developer_id: 1,
              endpoints: ["chat"],
              pricing: { input: 2.5, output: 10 },
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          { success: false, message: "removed", data: [] },
          { status: 404 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
        HttpResponse.json(
          { success: false, message: "not authenticated", data: [] },
          { status: 401 },
        ),
      ),
    )

    const result = await fetchModelPricing(baseRequest)
    const [model] = result.data

    expect(result.model_list_source).toMatchObject({
      kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
      provider: SITE_TYPES.AIHUBMIX,
    })
    expect(model).toMatchObject({
      model_name: "gpt-4o",
      model_description: "Public catalog model",
      owner_by: "1",
      supported_endpoint_types: ["chat"],
      token_price_usd_per_million: { input: 2.5, output: 10 },
    })
    expect(model).not.toHaveProperty("vendorEvidence")
    expect(
      resolveModelVendorCandidate(
        { id: model.model_name, vendorEvidence: model.vendorEvidence },
        { state: "unmatched" },
      ),
    ).toMatchObject({
      state: "candidate",
      knownId: "openai",
      source: "curated-rule",
    })
  })

  it("uses catalog fallback metadata when both user scope payloads are malformed", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-catalog-a", desc: "Catalog model A" },
            { model_id: "gpt-catalog-b", desc: "Catalog model B" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { unexpected: true },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: "bad",
        }),
      ),
    )

    await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        provider: SITE_TYPES.AIHUBMIX,
      },
      data: [
        { model_name: "gpt-catalog-a", enable_groups: [] },
        { model_name: "gpt-catalog-b", enable_groups: [] },
      ],
    })
  })

  it("treats a successful empty AIHubMix user scope as an empty model list", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model_id: "gpt-catalog-only", desc: "Catalog model" }],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({ success: true, message: "", data: [] }),
      ),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data).toEqual([])
  })

  it("keeps AIHubMix user-scoped model ids that are missing from the catalog as minimal rows", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model_id: "gpt-known", desc: "Known model" }],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gpt-missing-from-catalog" }],
        }),
      ),
    )

    await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
      data: [
        {
          model_name: "gpt-missing-from-catalog",
          model_description: "",
          model_ratio: 0,
          completion_ratio: 0,
          enable_groups: [],
          supported_endpoint_types: [],
        },
      ],
    })
  })

  it("maps catalog metadata into publisher and routing evidence without promoting standalone developer ids", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_id: "catalog-with-description",
              description: "Description fallback",
              developer_name: " ",
              developer: " Developer fallback ",
              developer_id: "opaque-developer-id",
              endpoints: " chat, embeddings , ",
            },
            {
              model_id: "catalog-with-owner",
              owner_by: " Owner fallback ",
              developer_id: 99,
            },
            {
              model_id: "catalog-with-developer-id",
              developer_id: 12,
            },
            {
              model_id: "catalog-with-string-developer-id",
              developer_id: "opaque-only",
            },
            {
              model_id: "catalog-with-invalid-developer-id",
              developer_name: "Valid Developer",
              developer_id: { invalid: true },
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model: "catalog-with-description" },
            { model: "catalog-with-owner" },
            { model: "catalog-with-developer-id" },
            { model: "catalog-with-string-developer-id" },
            { model: "catalog-with-invalid-developer-id" },
          ],
        }),
      ),
    )

    const result = await fetchModelPricing(baseRequest)

    expect(result).toMatchObject({
      data: [
        {
          model_name: "catalog-with-description",
          model_description: "Description fallback",
          owner_by: " ",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Developer fallback",
            externalId: "opaque-developer-id",
          },
          supported_endpoint_types: ["chat", "embeddings"],
        },
        {
          model_name: "catalog-with-owner",
          owner_by: " Owner fallback ",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
            name: "Owner fallback",
          },
        },
        {
          model_name: "catalog-with-developer-id",
          owner_by: "12",
        },
        {
          model_name: "catalog-with-string-developer-id",
          owner_by: "opaque-only",
        },
        {
          model_name: "catalog-with-invalid-developer-id",
          owner_by: "Valid Developer",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Valid Developer",
          },
        },
      ],
    })
    expect(result.data[1].vendorEvidence).not.toHaveProperty("externalId")
    expect(result.data[2]).not.toHaveProperty("vendorEvidence")
    expect(result.data[3]).not.toHaveProperty("vendorEvidence")
    expect(result.data[4].vendorEvidence).not.toHaveProperty("externalId")
  })

  it("normalizes nested catalog string model values", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model_id: "gpt-4o" }, { id: "claude-3-5-sonnet" }],
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
  })

  it("throws ApiError for malformed model catalog payloads", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: null,
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).rejects.toBeInstanceOf(ApiError)
  })

  it("fetches available models from the main API origin for console.aihubmix.com", async () => {
    let mainOriginModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () => {
        mainOriginModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: ["gpt-4o"],
        })
      }),
      http.get("https://console.aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: [],
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      fetchAccountAvailableModels({
        ...baseRequest,
        baseUrl: "https://console.aihubmix.com",
      }),
    ).resolves.toEqual(["gpt-4o"])
    expect(mainOriginModelsCalled).toBe(true)
  })

  it("falls back to the global model catalog when user available models fail", async () => {
    let globalModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          {
            success: false,
            message: "available models unavailable",
            data: [],
          },
          { status: 500 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
        HttpResponse.json(
          {
            success: false,
            message: "web available models unavailable",
            data: [],
          },
          { status: 500 },
        ),
      ),
      http.get("https://aihubmix.com/api/v1/models", () => {
        globalModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [{ model_id: "gpt-4o" }, { model_id: "claude-3-5-sonnet" }],
        })
      }),
    )

    await expect(fetchAccountAvailableModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
    expect(globalModelsCalled).toBe(true)
  })

  it("throws ApiError for malformed response bodies", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json(null),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).rejects.toBeInstanceOf(
      ApiError,
    )
  })

  it("throws a business ApiError when the API returns success false", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json({
          success: false,
          message: "business failed",
          data: null,
        }),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).rejects.toMatchObject({
      code: API_ERROR_CODES.BUSINESS_ERROR,
      message: "business failed",
    })
  })

  it("falls back to invalid response copy for business errors without a message", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json({
          success: false,
          data: null,
        }),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).rejects.toMatchObject({
      code: API_ERROR_CODES.BUSINESS_ERROR,
      message: "messages:errors.api.invalidResponseFormat",
    })
  })

  it.each([
    { name: "an object", message: { token: "provider-secret-placeholder" } },
    { name: "a number", message: 503 },
  ])(
    "falls back to invalid response copy for $name business message",
    async ({ message }) => {
      server.use(
        http.get("https://aihubmix.com/api/token/", () =>
          HttpResponse.json({
            success: false,
            message,
            data: null,
          }),
        ),
      )

      const failure = await fetchAccountTokens(baseRequest).catch(
        (error: unknown) => error,
      )

      expect(failure).toMatchObject({
        code: API_ERROR_CODES.BUSINESS_ERROR,
        message: "messages:errors.api.invalidResponseFormat",
      })
      expect((failure as Error).message).not.toContain(
        "provider-secret-placeholder",
      )
    },
  )
})
