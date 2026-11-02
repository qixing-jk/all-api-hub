import { http, HttpResponse } from "msw"
import { expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { loadAccountCatalogSource } from "~/services/modelCatalog/loader"
import { modelPricingCache } from "~/services/models/modelPricingCache"
import { server } from "~~/tests/msw/server"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/services/models/modelPricingCache", () => ({
  modelPricingCache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() },
}))

it("refreshes an old AIMLAPI HTML snapshot instead of reusing it after the structured-pricing upgrade", async () => {
  // The old schema is still admissible; its cache identity must be retired.
  vi.mocked(modelPricingCache.get).mockImplementation(async (key) =>
    key === "account-1|https://example.com|1|aimlapi|access_token"
      ? {
          success: true,
          data: [],
          groupAccess: { kind: "not-applicable" },
          groupRatios: {},
        }
      : null,
  )
  server.use(
    http.get("https://api.aimlapi.com/v1/models", () =>
      HttpResponse.json({
        data: [
          {
            id: "updated/model",
            info: { name: "Updated", developer: "Provider" },
            type: "openai/chat-completions",
            pricing: {
              kind: "fixed",
              currency: "USD",
              units: [
                {
                  type: "charge",
                  name: "token",
                  content: "text",
                  origin: "provided",
                  price: 2,
                  per: 1000000,
                  variable: false,
                },
              ],
            },
          },
        ],
      }),
    ),
  )
  const result = await loadAccountCatalogSource({
    loadScope: {},
    account: buildDisplaySiteData({ siteType: SITE_TYPES.AIMLAPI }),
  })
  expect(
    result.contexts[0]?.pricing.data.map((model) => model.model_name),
  ).toEqual(["updated/model"])
  expect(modelPricingCache.invalidate).not.toHaveBeenCalled()
})
