import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixModelPricing } from "~/services/apiAdapters/aihubmix/modelPricing"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/modelPricing"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { AuthTypeEnum } from "~/types"

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

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchModelPricing: mockAihubmixFetchModelPricing,
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

const pricingResponse: PricingResponse = {
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
  group_ratio: {},
  success: true,
  usable_group: {},
}

describe("apiAdapter modelPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates New API-family model pricing through the New API-family implementation", async () => {
    mockFetchModelPricing.mockResolvedValueOnce(pricingResponse)

    const modelPricing = createNewApiModelPricing(SITE_TYPES.NEW_API)

    await expect(modelPricing.fetchPricing(request)).resolves.toEqual(
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

      expect(mockOneHubFetchModelPricing).toHaveBeenCalledWith(request)
      expect(mockFetchModelPricing).not.toHaveBeenCalled()
    },
  )

  it("delegates AIHubMix model pricing to the AIHubMix helper", async () => {
    const aihubmixPricingResponse: PricingResponse = {
      ...pricingResponse,
      data: [
        {
          ...pricingResponse.data[0],
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
