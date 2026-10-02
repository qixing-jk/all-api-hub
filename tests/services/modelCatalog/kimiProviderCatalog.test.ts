import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import * as kimi from "~/services/apiService/kimiOpenPlatform"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { loadAccountCatalogSource } from "~/services/modelCatalog/loader"
import { modelPricingCache } from "~/services/models/modelPricingCache"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/kimiOpenPlatform", () => ({
  fetchKimiAccountModelCatalog: vi.fn(),
  fetchKimiPricingDoc: vi.fn(),
}))
vi.mock("~/services/models/modelPricingCache", () => ({
  modelPricingCache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() },
}))

describe("Kimi catalog routing and public fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(modelPricingCache.get).mockResolvedValue(null)
    vi.mocked(kimi.fetchKimiPricingDoc).mockResolvedValue([
      {
        modelId: "kimi-k3",
        currency: "USD",
        inputPrice: 3,
        outputPrice: 15,
      },
    ])
  })

  const load = () =>
    loadAccountCatalogSource({
      loadScope: {},
      account: buildDisplaySiteData({
        siteType: SITE_TYPES.KIMI_GLOBAL,
        token: "console-session",
      }),
    })

  it("keeps account visibility while enriching only matching model ids", async () => {
    vi.mocked(kimi.fetchKimiAccountModelCatalog).mockResolvedValue([
      { id: "kimi-k2.6" },
    ])
    const result = await load()
    expect(
      result.contexts[0]?.pricing.data.map((model) => model.model_name),
    ).toEqual(["kimi-k2.6"])
    expect(result.contexts[0]?.pricing.model_list_source).toMatchObject({
      catalogScope: "personalized",
    })
    expect(modelPricingCache.set).not.toHaveBeenCalled()
  })

  it.each([
    [new ApiError("expired", 401, "models", API_ERROR_CODES.HTTP_401), "auth"],
    [new Error("missing_kimi_project"), "upstream"],
    [null, "upstream"],
  ])(
    "discloses public fallback after account failure %s",
    async (failure, category) => {
      if (failure)
        vi.mocked(kimi.fetchKimiAccountModelCatalog).mockRejectedValueOnce(
          failure,
        )
      else
        vi.mocked(kimi.fetchKimiAccountModelCatalog).mockResolvedValueOnce([])
      const result = await load()
      expect(
        result.contexts[0]?.pricing.data.map((model) => model.model_name),
      ).toEqual(["kimi-k3"])
      expect(result.contexts[0]?.pricing.model_list_source).toMatchObject({
        catalogScope: "provider",
        catalogFallback: { from: "personalized", failureCategory: category },
      })
      expect(kimi.fetchKimiPricingDoc).toHaveBeenCalledWith({
        baseUrl: "https://platform.kimi.ai",
        abortSignal: undefined,
      })
      expect(modelPricingCache.set).toHaveBeenCalledWith(
        expect.stringContaining(
          "provider-catalog|kimi-open-platform-pricing-doc-kimi-global",
        ),
        expect.any(Object),
      )
    },
  )

  it("fails visibly when neither source is usable and caches no empty catalog", async () => {
    vi.mocked(kimi.fetchKimiAccountModelCatalog).mockRejectedValueOnce(
      new Error("expired"),
    )
    vi.mocked(kimi.fetchKimiPricingDoc).mockResolvedValueOnce([])
    await expect(load()).rejects.toThrow("invalid_kimi_pricing_doc")
    expect(modelPricingCache.set).not.toHaveBeenCalled()
  })

  it("does not replace cancellation with public fallback", async () => {
    const cancellation = new DOMException("Cancelled", "AbortError")
    vi.mocked(kimi.fetchKimiAccountModelCatalog).mockRejectedValueOnce(
      cancellation,
    )
    await expect(load()).rejects.toBe(cancellation)
    expect(kimi.fetchKimiPricingDoc).not.toHaveBeenCalled()
  })
})
