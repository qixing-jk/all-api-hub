import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixModelPricing } from "~/services/apiAdapters/aihubmix/modelPricing"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/modelPricing"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const {
  mockAihubmixFetchModelPricing,
  mockFetchModelPricing,
  mockOneHubFetchModelPricing,
} = vi.hoisted(() => ({
  mockAihubmixFetchModelPricing: vi.fn(),
  mockFetchModelPricing: vi.fn(),
  mockOneHubFetchModelPricing: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/modelPricing", () => ({
  defaultModelPricingImplementation: {
    fetchModelPricing: mockFetchModelPricing,
  },
}))

vi.mock("~/services/apiAdapters/aihubmix/catalog", () => ({
  fetchModelPricing: mockAihubmixFetchModelPricing,
  invalidateAIHubMixPublicCatalogs: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/variants/oneHub", () => ({
  fetchModelPricing: mockOneHubFetchModelPricing,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: 7,
    accessToken: "account-token",
  },
}

const pricingResponse: ModelCatalogSnapshot = {
  data: [
    {
      model_name: "example-model",
      quota_type: 0,
      model_ratio: 1,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: [],
      supported_endpoint_types: [],
    },
  ],
  groupRatios: {},
  success: true,
  groupAccess: { kind: "authoritative", usableGroups: [] },
}

describe("apiAdapter modelPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates New API-family model pricing through the New API-family implementation", async () => {
    mockFetchModelPricing.mockResolvedValueOnce({
      data: pricingResponse.data,
      success: true,
      group_ratio: {},
      usable_group: {},
    })

    const modelPricing = createNewApiModelPricing(SITE_TYPES.NEW_API)

    await expect(modelPricing.fetchPricing(request)).resolves.toMatchObject(
      pricingResponse,
    )

    expect(mockFetchModelPricing).toHaveBeenCalledOnce()
    expect(mockFetchModelPricing).toHaveBeenCalledWith(request)
  })

  it.each([SITE_TYPES.ONE_HUB, SITE_TYPES.DONE_HUB])(
    "uses OneHub-family model pricing override for %s",
    async (siteType) => {
      mockOneHubFetchModelPricing.mockResolvedValueOnce(pricingResponse)

      const modelPricing = createNewApiModelPricing(siteType)

      await expect(modelPricing.fetchPricing(request)).resolves.toBe(
        pricingResponse,
      )

      expect(mockOneHubFetchModelPricing).toHaveBeenCalledWith(
        request,
        siteType === SITE_TYPES.DONE_HUB,
      )
      expect(mockFetchModelPricing).not.toHaveBeenCalled()
    },
  )

  it("delegates AIHubMix model pricing to the AIHubMix helper", async () => {
    expect(aihubmixModelPricing.runtimeKeyFallback).toBe("account-pricing")
    const aihubmixPricingResponse: ModelCatalogSnapshot = {
      ...pricingResponse,
      data: [
        {
          ...atIndex(pricingResponse.data, 0),
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Example Publisher",
            externalId: "opaque-developer-id",
          },
        },
      ],
    }
    mockAihubmixFetchModelPricing.mockResolvedValueOnce(aihubmixPricingResponse)

    await expect(aihubmixModelPricing.fetchPricing(request)).resolves.toBe(
      aihubmixPricingResponse,
    )

    expect(mockAihubmixFetchModelPricing).toHaveBeenCalledOnce()
    expect(mockAihubmixFetchModelPricing).toHaveBeenCalledWith(request)
  })
})
