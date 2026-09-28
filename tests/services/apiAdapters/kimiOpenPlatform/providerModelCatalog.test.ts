import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createKimiOpenPlatformProviderModelCatalog } from "~/services/apiAdapters/kimiOpenPlatform/providerModelCatalog"
import * as kimiService from "~/services/apiService/kimiOpenPlatform"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { KimiPricingDocEntry } from "~/services/kimiOpenPlatform/pricingDoc"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import { isValidProviderModelCatalogPricing } from "~/services/modelList/providerCatalogAdmission"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"

vi.mock("~/services/apiService/kimiOpenPlatform", () => ({
  fetchKimiAccountModelCatalog: vi.fn(),
  fetchKimiPricingDoc: vi.fn(),
}))

const usdEntry = (
  modelId: string,
  inputPrice: number,
  outputPrice: number,
  cacheReadPrice?: number,
): KimiPricingDocEntry => ({
  modelId,
  currencySymbol: "$",
  inputPrice,
  outputPrice,
  ...(cacheReadPrice === undefined ? {} : { cacheReadPrice }),
})

const cnyEntry = (
  modelId: string,
  inputPrice: number,
  outputPrice: number,
): KimiPricingDocEntry => ({
  modelId,
  currencySymbol: "¥",
  inputPrice,
  outputPrice,
})

const personalizedRequest = {
  accountId: "acc-1",
  credential: "console-jwt",
}

describe("kimiOpenPlatform provider model catalog", () => {
  it("redacts account credentials from disclosed catalog failures while preserving classification", async () => {
    vi.mocked(kimiService.fetchKimiAccountModelCatalog).mockRejectedValueOnce(
      new ApiError(
        "invalid console-jwt",
        401,
        "models",
        API_ERROR_CODES.HTTP_401,
      ),
    )
    const capability = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI_GLOBAL,
    )
    await expect(
      capability.personalized!.fetchPricing(personalizedRequest),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.HTTP_401,
      message: "invalid [REDACTED]",
    })
  })
  it("scopes its published source per deployment", () => {
    const global = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI_GLOBAL,
    )
    const china = createKimiOpenPlatformProviderModelCatalog(SITE_TYPES.KIMI)

    expect(global.source.provider).toBe(SITE_TYPES.KIMI_GLOBAL)
    expect(china.source.provider).toBe(SITE_TYPES.KIMI)
    expect(global.source.id).not.toBe(china.source.id)
  })

  it("refuses a site type that is not a Kimi deployment", () => {
    expect(() =>
      createKimiOpenPlatformProviderModelCatalog(SITE_TYPES.OPENROUTER),
    ).toThrow("unknown_kimi_site_type")
  })

  it("prices the account's own catalogue from the published USD table", async () => {
    vi.mocked(kimiService.fetchKimiAccountModelCatalog).mockResolvedValueOnce([
      { id: "kimi-k2.6" },
    ])
    vi.mocked(kimiService.fetchKimiPricingDoc).mockResolvedValueOnce([
      usdEntry("kimi-k2.6", 0.95, 4, 0.16),
      usdEntry("kimi-k3", 3, 15, 0.3),
    ])

    const capability = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI_GLOBAL,
    )
    const response =
      await capability.personalized!.fetchPricing(personalizedRequest)

    expect(
      isValidProviderModelCatalogPricing(response, SITE_TYPES.KIMI_GLOBAL),
    ).toBe(true)
    expect(response.model_list_source.catalogScope).toBe(
      MODEL_CATALOG_SCOPES.PERSONALIZED,
    )
    expect(response.model_list_source.supportsPricing).toBe(true)
    expect(response.data).toEqual([
      expect.objectContaining({
        model_name: "kimi-k2.6",
        token_price_usd_per_million: {
          input: 0.95,
          output: 4,
          cache_read: 0.16,
        },
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
        },
      }),
    ])
  })

  it("lists a model the published table does not price, without a price", async () => {
    vi.mocked(kimiService.fetchKimiAccountModelCatalog).mockResolvedValueOnce([
      { id: "kimi-k2.6" },
    ])
    vi.mocked(kimiService.fetchKimiPricingDoc).mockResolvedValueOnce([
      usdEntry("kimi-k3", 3, 15),
    ])

    const capability = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI_GLOBAL,
    )
    const response =
      await capability.personalized!.fetchPricing(personalizedRequest)

    expect(response.data[0]?.token_price_usd_per_million).toBeUndefined()
    expect(response.data[0]?.price_metadata).toEqual({
      source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
      precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
      unavailable_reason:
        MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
    })
  })

  it("never relabels a table published in another currency as the USD price", async () => {
    vi.mocked(kimiService.fetchKimiAccountModelCatalog).mockResolvedValueOnce([
      { id: "kimi-k3" },
    ])
    vi.mocked(kimiService.fetchKimiPricingDoc).mockResolvedValueOnce([
      cnyEntry("kimi-k3", 20, 100),
    ])

    const capability = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI,
    )
    const response =
      await capability.personalized!.fetchPricing(personalizedRequest)

    expect(response.data[0]?.token_price_usd_per_million).toBeUndefined()
    expect(response.model_list_source.supportsPricing).toBe(true)
    expect(response.data[0]?.pricingPlan?.rates.input).toEqual({
      amount: 20,
      currency: "CNY",
      unit: "token",
      per: 1000000,
    })
    expect(
      quoteCanonicalModelPrice(
        response.data[0]!,
        { purpose: "request", usage: { input: 1000000, output: 0 } },
        { currency: "CNY" },
      ),
    ).toMatchObject({ amount: 20, currency: "CNY" })
    expect(response.data[0]?.price_metadata).toEqual({
      source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
      precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
      unavailable_reason:
        MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
    })
  })

  it("rejects an empty account catalog so the loader can use the public source", async () => {
    vi.mocked(kimiService.fetchKimiAccountModelCatalog).mockResolvedValueOnce(
      [],
    )
    const capability = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI_GLOBAL,
    )
    await expect(
      capability.personalized!.fetchPricing(personalizedRequest),
    ).rejects.toThrow("kimi_model_list_empty")
  })

  it("rejects an unrecognized public document instead of caching an empty success", async () => {
    vi.mocked(kimiService.fetchKimiPricingDoc).mockResolvedValueOnce([])
    const capability = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI_GLOBAL,
    )
    await expect(capability.fetchPricing({})).rejects.toThrow(
      "invalid_kimi_pricing_doc",
    )
  })

  it("keeps the account's models when the price table cannot be read", async () => {
    vi.mocked(kimiService.fetchKimiAccountModelCatalog).mockResolvedValueOnce([
      { id: "kimi-k2.6" },
    ])
    vi.mocked(kimiService.fetchKimiPricingDoc).mockRejectedValueOnce(
      new Error("docs unavailable"),
    )

    const capability = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI_GLOBAL,
    )
    const response =
      await capability.personalized!.fetchPricing(personalizedRequest)

    expect(response.data.map((row) => row.model_name)).toEqual(["kimi-k2.6"])
    expect(response.model_list_source.supportsPricing).toBe(false)
  })

  it("publishes the platform table as the provider-wide source", async () => {
    vi.mocked(kimiService.fetchKimiPricingDoc).mockResolvedValueOnce([
      usdEntry("kimi-k3", 3, 15, 0.3),
      usdEntry("kimi-k2.6", 0.95, 4, 0.16),
    ])

    const capability = createKimiOpenPlatformProviderModelCatalog(
      SITE_TYPES.KIMI_GLOBAL,
    )
    const response = await capability.fetchPricing({})

    expect(
      isValidProviderModelCatalogPricing(response, SITE_TYPES.KIMI_GLOBAL),
    ).toBe(true)
    expect(response.model_list_source.catalogScope).toBe(
      MODEL_CATALOG_SCOPES.PROVIDER,
    )
    expect(response.data.map((row) => row.model_name)).toEqual([
      "kimi-k3",
      "kimi-k2.6",
    ])
  })
})
