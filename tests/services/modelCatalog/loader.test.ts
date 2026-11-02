import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createModelPricingQueryKey } from "~/features/ModelList/catalog/modelDataQueryPolicy"
import {
  createModelPricingCacheKey,
  loadAccountModelCatalog,
} from "~/services/modelCatalog/loader"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { modelPricingCache } from "~/services/models/modelPricingCache"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/services/models/modelPricingCache", () => ({
  modelPricingCache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() },
}))

describe("account catalog loader", () => {
  it("versions both persisted and in-memory pricing caches by adapter revision", () => {
    const legacy = buildDisplaySiteData({ siteType: SITE_TYPES.NEW_API })
    const versioned = buildDisplaySiteData({ siteType: SITE_TYPES.KRILL })
    expect(createModelPricingCacheKey(legacy)).not.toContain(
      "pricing-source-notes-v1",
    )
    expect(createModelPricingCacheKey(versioned)).toContain(
      "pricing-source-notes-v1",
    )
    expect(createModelPricingQueryKey(versioned)).toContain(
      "pricing-source-notes-v1",
    )
    expect(createModelPricingQueryKey(legacy)).not.toContain(
      "pricing-source-notes-v1",
    )
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(modelPricingCache.get).mockResolvedValue(null)
  })

  it("rejects missing access evidence before caching a model array", async () => {
    const fetchPricing = vi
      .fn()
      .mockResolvedValue({ data: [], success: true, groupRatios: {} })
    await expect(
      loadAccountModelCatalog({
        account: buildDisplaySiteData(),
        capability: { fetchPricing },
      }),
    ).rejects.toMatchObject({ code: "INVALID_FORMAT" })
    expect(modelPricingCache.set).not.toHaveBeenCalled()
  })

  it("keeps authoritative empty access intact when caching a free group price", async () => {
    const pricing: ModelCatalogSnapshot = {
      data: [],
      success: true,
      groupRatios: { default: 0 },
      groupAccess: { kind: "authoritative", usableGroups: [] },
    }
    const result = await loadAccountModelCatalog({
      account: buildDisplaySiteData(),
      capability: { fetchPricing: vi.fn().mockResolvedValue(pricing) },
    })
    expect(result).toEqual({ pricing, cacheHit: false })
    expect(modelPricingCache.set).toHaveBeenCalledWith(
      expect.any(String),
      pricing,
    )
  })
  it("does not publish or cache a late result after caller cancellation", async () => {
    const controller = new AbortController()
    const reason = new DOMException("Cancelled", "AbortError")
    const pricing: ModelCatalogSnapshot = {
      data: [],
      success: true,
      groupRatios: {},
      groupAccess: { kind: "not-applicable" },
    }
    await expect(
      loadAccountModelCatalog({
        account: buildDisplaySiteData(),
        abortSignal: controller.signal,
        capability: {
          fetchPricing: vi.fn().mockImplementation(async () => {
            controller.abort(reason)
            return pricing
          }),
        },
      }),
    ).rejects.toBe(reason)
    expect(modelPricingCache.set).not.toHaveBeenCalled()
  })
})
