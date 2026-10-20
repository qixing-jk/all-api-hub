import { beforeEach, describe, expect, it, vi } from "vitest"

import { MODEL_PRICING_RUNTIME_KEY_FALLBACKS } from "~/services/apiAdapters/contracts/modelPricing"
import { relayForModelPricing } from "~/services/apiAdapters/relayfor/modelPricing"
import {
  fetchRelayForModels,
  updateRelayForModelGroup,
} from "~/services/apiService/relayfor"
import { pricingPlanSchema } from "~/services/modelPricing/pricingPlan"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/relayfor", () => ({
  fetchRelayForModels: vi.fn(),
  updateRelayForModelGroup: vi.fn(),
}))

const request = {
  baseUrl: "https://relayfor.xyz",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token-abc" },
}

describe("relayForModelPricing", () => {
  it("leaves catalog readback to the host refresh after saving routing", async () => {
    vi.mocked(fetchRelayForModels).mockClear()
    await relayForModelPricing.updateGroup!(request, "gpt-4o", "premium")
    expect(updateRelayForModelGroup).toHaveBeenCalledWith(
      request,
      "gpt-4o",
      "premium",
    )
    expect(fetchRelayForModels).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("retains subscription access facts and per-request prices", async () => {
    vi.mocked(fetchRelayForModels).mockResolvedValueOnce({
      items: [
        {
          model: "image",
          billing_mode: "request",
          effective_request_price: 0.05,
          subscription_plan: "Pro",
          subscription_multiplier: 0.5,
        },
        {
          model: "free-image",
          billing_mode: "request",
          free_model: true,
          base_request_price: 1,
        },
        {
          model: "base-image",
          billing_mode: "request",
          base_request_price: 0.1,
        },
        { model: "unknown-image", billing_mode: "request" },
      ],
    })
    const catalog = await relayForModelPricing.fetchPricing(request)
    expect(catalog.data.map((m) => m.model_price)).toEqual([0.05, 0, 0.1, 0])
    expect(catalog.data[0]?.presentation?.summaryFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", value: "Pro" }),
        expect.objectContaining({ type: "number", value: 0.5 }),
      ]),
    )
    expect(catalog.data.every((m) => m.quota_type === 1)).toBe(true)
  })

  it("declares ACCOUNT_PRICING fallback", () => {
    expect(relayForModelPricing.runtimeKeyFallback).toBe(
      MODEL_PRICING_RUNTIME_KEY_FALLBACKS.ACCOUNT_PRICING,
    )
  })

  it("fetches models and constructs model catalog snapshot", async () => {
    vi.mocked(fetchRelayForModels).mockResolvedValueOnce({
      items: [
        {
          model: "gpt-4o",
          display_name: "GPT-4o",
          accessible: true,
          pricing: {
            prompt_ratio: 1,
            completion_ratio: 2,
          },
        },
      ],
    })

    const snapshot = await relayForModelPricing.fetchPricing(request)

    expect(snapshot.success).toBe(true)
    expect(snapshot.data).toHaveLength(1)
    expect(snapshot.data[0]?.model_name).toBe("gpt-4o")
    expect(snapshot.data[0]?.model_ratio).toBe(1)
    expect(snapshot.data[0]?.completion_ratio).toBe(2)
  })

  it("handles unpriced models and empty items", async () => {
    vi.mocked(fetchRelayForModels).mockResolvedValueOnce({
      items: [
        {
          model: "claude-3-5-sonnet",
        },
      ],
    })

    const snapshot = await relayForModelPricing.fetchPricing(request)

    expect(snapshot.success).toBe(true)
    expect(snapshot.data).toHaveLength(1)
    expect(snapshot.data[0]?.model_name).toBe("claude-3-5-sonnet")
    expect(snapshot.data[0]?.model_ratio).toBe(1)
    expect(snapshot.data[0]?.completion_ratio).toBe(1)
    expect(snapshot.data[0]?.price_metadata?.precision).toBe("unavailable")
  })

  it("normalizes native effective_prices and base_prices in USD per million tokens", async () => {
    vi.mocked(fetchRelayForModels).mockResolvedValueOnce({
      items: [
        {
          model: "claude-3-7-sonnet",
          display_name: "Claude 3.7 Sonnet",
          accessible: true,
          billing_mode: "token",
          effective_prices: {
            input: 3,
            output: 15,
            cache_read: 0.3,
            cache_write: 3.75,
          },
          supported_endpoints: ["/v1/chat/completions", "/v1/messages"],
        },
      ],
    })

    const snapshot = await relayForModelPricing.fetchPricing(request)

    expect(snapshot.success).toBe(true)
    expect(snapshot.data).toHaveLength(1)
    const item = snapshot.data[0]!
    expect(item.model_name).toBe("claude-3-7-sonnet")
    expect(item.quota_type).toBe(0)
    expect(item.token_price_usd_per_million).toEqual({
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    })
    expect(item.price_metadata?.precision).toBe("exact")
    expect(item.supported_endpoint_types).toEqual([
      "Chat Completions",
      "Messages",
    ])
  })

  it("normalizes request-based models with per-call price", async () => {
    vi.mocked(fetchRelayForModels).mockResolvedValueOnce({
      items: [
        {
          model: "midjourney",
          display_name: "Midjourney",
          billing_mode: "request",
          effective_request_price: 0.05,
        },
      ],
    })

    const snapshot = await relayForModelPricing.fetchPricing(request)

    expect(snapshot.success).toBe(true)
    const item = snapshot.data[0]!
    expect(item.quota_type).toBe(1)
    expect(item.model_price).toBe(0.05)
    expect(item.price_metadata?.precision).toBe("exact")
  })

  it("normalizes free models with 0 price and exact precision", async () => {
    vi.mocked(fetchRelayForModels).mockResolvedValueOnce({
      items: [
        {
          model: "free-model",
          display_name: "Free Model",
          free_model: true,
        },
      ],
    })

    const snapshot = await relayForModelPricing.fetchPricing(request)

    expect(snapshot.success).toBe(true)
    const item = snapshot.data[0]!
    expect(item.quota_type).toBe(0)
    expect(item.token_price_usd_per_million).toEqual({
      input: 0,
      output: 0,
      cache_read: 0,
      cache_write: 0,
    })
    expect(item.price_metadata?.precision).toBe("exact")
  })

  it("falls back to base_prices when effective_prices is absent", async () => {
    vi.mocked(fetchRelayForModels).mockResolvedValueOnce({
      items: [
        {
          model: "gpt-4o-mini",
          base_prices: {
            input: 0.15,
            output: 0.6,
          },
        },
      ],
    })

    const snapshot = await relayForModelPricing.fetchPricing(request)

    expect(snapshot.success).toBe(true)
    const item = snapshot.data[0]!
    expect(item.token_price_usd_per_million).toEqual({
      input: 0.15,
      output: 0.6,
    })
    expect(item.price_metadata?.precision).toBe("exact")
  })

  it.each(["https://relayfor.xyz", "https://relay.example.test/console/"])(
    "normalizes long-context prices with the account model-page source at %s",
    async (baseUrl) => {
      vi.mocked(fetchRelayForModels).mockResolvedValueOnce({
        items: [
          {
            model: "claude-3-7-sonnet",
            display_name: "Claude 3.7 Sonnet",
            accessible: true,
            billing_mode: "token",
            effective_prices: {
              input: 3,
              output: 15,
              cache_read: 0.3,
              cache_write: 3.75,
            },
            long_context_threshold: 200000,
            long_context_effective_prices: {
              input: 6,
              output: 30,
              cache_read: 0.6,
              cache_write: 7.5,
            },
          },
        ],
      })

      const snapshot = await relayForModelPricing.fetchPricing({
        ...request,
        baseUrl,
      })

      expect(snapshot.success).toBe(true)
      const item = snapshot.data[0]!
      expect(item.token_price_usd_per_million).toEqual({
        input: 3,
        output: 15,
        cache_read: 0.3,
        cache_write: 3.75,
      })
      expect(item.model_description).toBeUndefined()
      expect(item.pricingPlan).toBeDefined()
      expect(item.pricingPlan?.source.url).toBe(
        new URL("/console/#models", baseUrl).href,
      )
      expect(item.pricingPlan?.source?.pricingDescription?.zh).toContain(
        "长上下文 > 200,000 输入 Token",
      )
      expect(item.pricingPlan?.source?.pricingDescription?.en).toContain(
        "Long context > 200,000",
      )
      expect(pricingPlanSchema.safeParse(item.pricingPlan).success).toBe(true)
      expect(item.pricingPlan?.rules).toHaveLength(1)
      const rule = item.pricingPlan?.rules[0]
      expect(rule).toBeDefined()
      expect(rule?.id).toBe("long-context")
      expect(rule?.conditions[0]).toMatchObject({
        kind: "range",
        axis: "inputTokens",
        min: 200001,
      })
      expect(rule?.rates.input?.amount).toBe(6)
      expect(rule?.rates.output?.amount).toBe(30)
      expect(rule?.rates.cacheRead?.amount).toBe(0.6)
      expect(rule?.rates.cacheWrite?.amount).toBe(7.5)
    },
  )
})
