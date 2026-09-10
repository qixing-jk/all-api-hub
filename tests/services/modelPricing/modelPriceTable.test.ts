import { afterEach, describe, expect, it, vi } from "vitest"

import {
  LITELLM_MODEL_PRICE_TABLE_URL,
  loadModelPriceTable,
  MODEL_PRICE_TABLE_FETCH_TIMEOUT_MS,
} from "~/services/modelPricing/modelPriceTable"
import {
  PRICING_PURPOSES,
  PRICING_SERVICE_TIERS,
} from "~/services/modelPricing/pricingConstants"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

describe("loadModelPriceTable", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("uses explicit batch rates for all prompt tokens without context or off-peak adjustments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          example: {
            input_cost_per_token: 0.000002,
            output_cost_per_token: 0.000006,
            input_cost_per_token_batches: 0.000001,
            output_cost_per_token_batches: 0.000003,
            input_cost_per_token_above_200k_tokens: 0.000004,
            off_peak_pricing: {
              hours_utc: "10:00-12:00",
              input_cost_per_token: 0.0000001,
            },
          },
        }),
      }),
    )
    const plan = (await loadModelPriceTable()).models.example.pricingPlan!
    const quote = quoteModelPrice(
      plan,
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        serviceTier: PRICING_SERVICE_TIERS.BATCH,
        inputTokens: 300000,
        usage: { input: 1, cacheRead: 1, output: 1 },
      },
      { groupMultiplier: 1 },
    )
    expect(quote.status).toBe("complete")
    expect(quote.amount).toBeCloseTo(5 / 3)
  })

  it("quotes the chosen service tier including context overrides without silently substituting standard prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          example: {
            input_cost_per_token: 0.000001,
            output_cost_per_token: 0.000003,
            input_cost_per_token_priority: 0.000002,
            output_cost_per_token_priority: 0.000006,
            input_cost_per_token_above_200k_tokens: 0.000004,
            input_cost_per_token_above_200k_tokens_priority: 0.000008,
          },
        }),
      }),
    )
    const plan = (await loadModelPriceTable()).models.example.pricingPlan!
    const quote = (
      serviceTier: "standard" | "priority" | "flex",
      inputTokens = 200000,
    ) =>
      quoteModelPrice(
        plan,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          serviceTier,
          inputTokens,
          usage: { input: 1, output: 1 },
        },
        { groupMultiplier: 1 },
      )
    expect(quote("standard").amount).toBe(2)
    expect(quote("priority").amount).toBe(4)
    expect(quote("priority", 200001).amount).toBe(7)
    expect(quote("flex")).toMatchObject({ status: "unavailable", amount: null })
  })

  it("selects LiteLLM interval tiers for the whole request with last-tier gap fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          example: {
            input_cost_per_token: 0.000001,
            output_cost_per_token: 0.000005,
            tiered_pricing: [
              {
                range: [0, 32000],
                input_cost_per_token: 0.000002,
                cache_read_input_token_cost: 0,
              },
              {
                range: [64000, 128000],
                input_cost_per_token: 0.000004,
                output_cost_per_token: 0.00001,
              },
            ],
          },
        }),
      }),
    )
    const plan = (await loadModelPriceTable()).models.example.pricingPlan!
    const quote = (inputTokens: number) =>
      quoteModelPrice(
        plan,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          inputTokens,
          usage: { input: 1, output: 1, cacheRead: 1, cacheWrite1h: 1 },
        },
        { groupMultiplier: 1 },
      )
    expect(quote(32000)).toMatchObject({ status: "complete", amount: 2.25 })
    expect(quote(32001)).toMatchObject({ status: "complete", amount: 5.5 })
    expect(quote(128001).amount).toBe(5.5)
  })

  it("overlays LiteLLM off-peak rates after context selection and evaluates weekdays in their own timezone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          example: {
            input_cost_per_token: 0.000001,
            output_cost_per_token: 0.000002,
            input_cost_per_token_above_200k_tokens: 0.000003,
            off_peak_pricing: {
              input_cost_per_token: 0.0000005,
              weekday_timezone: "Asia/Shanghai",
              windows: [{ hours_utc: "16:00-18:00", weekdays: [2] }],
            },
          },
        }),
      }),
    )
    const table = await loadModelPriceTable()
    const quote = (at: string) =>
      quoteModelPrice(
        table.models.example.pricingPlan!,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          inputTokens: 300000,
          at,
          usage: { input: 1, output: 1 },
        },
        { groupMultiplier: 1 },
      )
    expect(quote("2026-09-07T16:00:00Z")).toMatchObject({
      status: "complete",
      amount: 1.25,
    })
    expect(quote("2026-09-07T18:00:00Z").amount).toBe(2.5)
  })

  it("preserves whole-request context thresholds and independent one-hour cache rates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          example: {
            litellm_provider: "gemini",
            input_cost_per_token: 0.00000125,
            output_cost_per_token: 0.00001,
            cache_creation_input_token_cost_above_1hr: 0.000006,
            input_cost_per_token_above_200k_tokens: 0.0000025,
            output_cost_per_token_above_200k_tokens: 0.000015,
          },
        }),
      }),
    )
    const table = await loadModelPriceTable()
    expect(table.models.example.pricingPlan).toBeDefined()
    const plan = table.models.example.pricingPlan!
    const quote = (inputTokens: number) =>
      quoteModelPrice(
        plan,
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          inputTokens,
          usage: { input: 1, output: 1 },
        },
        { groupMultiplier: 1 },
      )
    expect(quote(200000).amount).toBe(5.625)
    expect(quote(200001).amount).toBe(8.75)
    expect(plan.rates.cacheWrite1h?.amount).toBe(0.000006)
  })

  it("loads and normalizes LiteLLM token prices into USD-per-million units", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        "example-priced-model": {
          input_cost_per_token: 0.000002,
          output_cost_per_token: "0.000006",
          cache_read_input_token_cost: 0.00000025,
          cache_creation_input_token_cost: "0.0000005",
        },
        "example-empty-model": {},
        sample_spec: {
          input_cost_per_token: 1,
          output_cost_per_token: 1,
        },
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(loadModelPriceTable()).resolves.toEqual({
      source:
        "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json",
      models: {
        "example-priced-model": {
          input: 2,
          output: 6,
          cache_read: 0.25,
          cache_write: 0.5,
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(LITELLM_MODEL_PRICE_TABLE_URL, {
      signal: expect.any(AbortSignal),
    })
  })

  it("rejects failed or malformed price-table responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn(),
      }),
    )

    await expect(loadModelPriceTable()).rejects.toThrow(
      "Failed to load LiteLLM price table",
    )

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(null),
      }),
    )

    await expect(loadModelPriceTable()).rejects.toThrow(
      "Invalid LiteLLM price table payload",
    )
  })

  it("aborts hung LiteLLM price-table requests", async () => {
    vi.useFakeTimers()
    let abortSignal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        abortSignal = init?.signal ?? undefined

        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
      }),
    )

    const loading = loadModelPriceTable()
    const loadingExpectation = expect(loading).rejects.toThrow(
      "Timed out loading LiteLLM price table",
    )

    await vi.advanceTimersByTimeAsync(MODEL_PRICE_TABLE_FETCH_TIMEOUT_MS)

    expect(abortSignal?.aborted).toBe(true)
    await loadingExpectation
  })

  it("aborts LiteLLM price-table requests when the caller signal aborts", async () => {
    const abortController = new AbortController()
    let abortSignal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        abortSignal = init?.signal ?? undefined

        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
      }),
    )

    const loading = loadModelPriceTable(abortController.signal)
    const loadingExpectation = expect(loading).rejects.toMatchObject({
      name: "AbortError",
    })

    abortController.abort()

    expect(abortSignal?.aborted).toBe(true)
    await loadingExpectation
  })

  it("uses the timeout controller when AbortSignal.any is unavailable", async () => {
    const originalAny = AbortSignal.any
    const callerAbortController = new AbortController()
    let fetchSignal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignal = init?.signal ?? undefined

        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
      }),
    )
    Object.defineProperty(AbortSignal, "any", {
      configurable: true,
      value: undefined,
    })

    try {
      const loading = loadModelPriceTable(callerAbortController.signal)
      const loadingExpectation = expect(loading).rejects.toMatchObject({
        name: "AbortError",
      })

      callerAbortController.abort()

      expect(fetchSignal?.aborted).toBe(true)
      await loadingExpectation
    } finally {
      Object.defineProperty(AbortSignal, "any", {
        configurable: true,
        value: originalAny,
      })
    }
  })

  it("relays an already-aborted caller signal when AbortSignal.any is unavailable", async () => {
    const originalAny = AbortSignal.any
    const callerAbortController = new AbortController()
    const abortError = new DOMException("Already stopped", "AbortError")
    callerAbortController.abort(abortError)
    let fetchSignal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignal = init?.signal ?? undefined
        return Promise.reject(
          new DOMException("The operation was aborted", "AbortError"),
        )
      }),
    )
    Object.defineProperty(AbortSignal, "any", {
      configurable: true,
      value: undefined,
    })

    try {
      await expect(
        loadModelPriceTable(callerAbortController.signal),
      ).rejects.toMatchObject({
        name: "AbortError",
      })

      expect(fetchSignal?.aborted).toBe(true)
      expect(fetchSignal?.reason).toBe(abortError)
    } finally {
      Object.defineProperty(AbortSignal, "any", {
        configurable: true,
        value: originalAny,
      })
    }
  })
})
