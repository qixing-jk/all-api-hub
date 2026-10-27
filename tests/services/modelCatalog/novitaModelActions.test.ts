import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createAccountSource } from "~/features/ModelList/catalog/modelManagementSources"
import { prepareModelListSource } from "~/features/ModelList/catalog/sourcePreparation"
import { novitaProviderModelCatalog } from "~/services/apiAdapters/novita/providerModelCatalog"
import { loadAccountCatalogSource } from "~/services/modelCatalog/loader"
import { modelPricingCache } from "~/services/models/modelPricingCache"
import { server } from "~~/tests/msw/server"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/services/models/modelPricingCache", () => ({
  modelPricingCache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() },
}))

describe("Novita account model actions", () => {
  beforeEach(() => {
    vi.mocked(modelPricingCache.get).mockResolvedValue(null)
    server.use(
      http.get("https://api.novita.ai/openai/v1/models", ({ request }) => {
        expect(request.headers.get("authorization")).toBeNull()
        return HttpResponse.json({
          data: [
            { id: "model-a", created: 0, endpoints: ["chat/completions"] },
          ],
        })
      }),
    )
  })

  it("binds model actions to each selected account without relabeling public visibility", async () => {
    for (const id of ["novita-one", "novita-two"]) {
      const account = buildDisplaySiteData({
        id,
        siteType: SITE_TYPES.NOVITA,
        baseUrl: "https://novita.ai",
        token: "novita-console:management-only",
      })
      const result = await loadAccountCatalogSource({ account, loadScope: {} })
      const context = result.contexts[0]!
      expect(context.sourceIdentity).toEqual({ kind: "account", id })
      expect(context.pricing.model_list_source).toMatchObject({
        catalogScope: "provider",
      })
      const prepared = prepareModelListSource({
        source: createAccountSource(account),
        pricing: context.pricing,
        sourceIdentity: context.sourceIdentity,
      })
      expect(prepared.source.capabilities).toMatchObject({
        supportsTokenCompatibility: true,
        supportsCredentialVerification: true,
        supportsBatchCredentialVerification: true,
        supportsCliVerification: true,
        supportsGroupFiltering: false,
      })
    }
  })

  it("keeps the standalone public catalog free of borrowed account actions", async () => {
    const pricing = await novitaProviderModelCatalog.fetchPricing({})
    expect(pricing.model_list_source.actionPolicy).toMatchObject({
      supportsTokenCompatibility: false,
      supportsCredentialVerification: false,
      supportsBatchCredentialVerification: false,
      supportsCliVerification: false,
    })
  })
})
