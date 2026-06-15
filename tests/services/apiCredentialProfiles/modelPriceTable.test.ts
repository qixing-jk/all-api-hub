import { afterEach, describe, expect, it, vi } from "vitest"

import { loadModelPriceTable } from "~/services/apiCredentialProfiles/modelPriceTable"

describe("loadModelPriceTable", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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
        "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
      models: {
        "example-priced-model": {
          input: 2,
          output: 6,
          cache_read: 0.25,
          cache_write: 0.5,
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
    )
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
})
