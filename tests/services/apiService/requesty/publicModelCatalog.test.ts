import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { fetchRequestyPublicModelCatalog } from "~/services/apiService/requesty/publicModelCatalog"
import { server } from "~~/tests/msw/server"

const CATALOG_URL = "https://router.requesty.ai/v1/models"

describe("Requesty public model catalog", () => {
  it("keeps unpriced rows and reads the provider's per-token quote", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json({
          data: [
            {
              id: "openai/gpt-4o-mini",
              description: "A small model",
              input_price: 1.5e-7,
              output_price: 6e-7,
              cached_price: 7.5e-8,
              context_window: 128000,
              supports_caching: true,
              supports_tool_calling: true,
            },
            {
              // No quote: the row must survive so the catalog still lists it.
              id: "vendor/unpriced",
              input_price: null,
              output_price: null,
            },
          ],
        }),
      ),
    )

    await expect(fetchRequestyPublicModelCatalog()).resolves.toEqual([
      {
        id: "openai/gpt-4o-mini",
        description: "A small model",
        inputPrice: 1.5e-7,
        outputPrice: 6e-7,
        cachedPrice: 7.5e-8,
        contextWindow: 128000,
        supportsCaching: true,
        supportsVision: false,
        supportsReasoning: false,
        supportsToolCalling: true,
      },
      expect.objectContaining({
        id: "vendor/unpriced",
        inputPrice: -1,
        outputPrice: -1,
      }),
    ])
  })

  it("rejects a catalog row that carries no model id", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json({ data: [{ input_price: 1e-7 }] }),
      ),
    )

    await expect(fetchRequestyPublicModelCatalog()).rejects.toThrow(
      /invalid_requesty_model/,
    )
  })

  it("surfaces an upstream failure instead of an empty catalog", async () => {
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json({ error: "unavailable" }, { status: 503 }),
      ),
    )

    await expect(fetchRequestyPublicModelCatalog()).rejects.toMatchObject({
      statusCode: 503,
    })
  })

  it.each([[{}], [{ data: {} }], ["not-a-catalog"]])(
    "rejects a malformed catalog envelope: %j",
    async (payload) => {
      server.use(http.get(CATALOG_URL, () => HttpResponse.json(payload)))
      await expect(fetchRequestyPublicModelCatalog()).rejects.toMatchObject({
        message: expect.stringMatching(/Invalid Requesty model catalog/),
      })
    },
  )
})
