import { afterEach, describe, expect, it, vi } from "vitest"

import {
  LITELLM_MODEL_PRICE_TABLE_URL,
  loadModelPriceTable,
  MODEL_PRICE_TABLE_FETCH_TIMEOUT_MS,
} from "~/services/apiCredentialProfiles/modelPriceTable"

describe("loadModelPriceTable", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
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
      source: LITELLM_MODEL_PRICE_TABLE_URL,
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
})
