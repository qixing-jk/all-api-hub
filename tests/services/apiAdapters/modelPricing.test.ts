import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixModelPricing } from "~/services/apiAdapters/aihubmix/modelPricing"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/modelPricing"
import type { PricingResponse } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  mockAihubmixFetchModelPricing,
  mockFetchModelPricing,
  mockGetApiService,
} = vi.hoisted(() => ({
  mockAihubmixFetchModelPricing: vi.fn(),
  mockFetchModelPricing: vi.fn(),
  mockGetApiService: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchModelPricing: mockAihubmixFetchModelPricing,
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
    mockGetApiService.mockReturnValue({
      fetchModelPricing: mockFetchModelPricing,
    })
  })

  it("delegates New API-family model pricing through the site-specific apiService", async () => {
    mockFetchModelPricing.mockResolvedValueOnce(pricingResponse)

    const modelPricing = createNewApiModelPricing(SITE_TYPES.ONE_HUB)

    expect(mockGetApiService).not.toHaveBeenCalled()

    await expect(modelPricing.fetchPricing(request)).resolves.toBe(
      pricingResponse,
    )

    expect(mockGetApiService).toHaveBeenCalledOnce()
    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.ONE_HUB)
    expect(mockFetchModelPricing).toHaveBeenCalledOnce()
    expect(mockFetchModelPricing).toHaveBeenCalledWith(request)
  })

  it("delegates AIHubMix model pricing to the AIHubMix helper", async () => {
    mockAihubmixFetchModelPricing.mockResolvedValueOnce(pricingResponse)

    await expect(aihubmixModelPricing.fetchPricing(request)).resolves.toBe(
      pricingResponse,
    )

    expect(mockGetApiService).not.toHaveBeenCalled()
    expect(mockAihubmixFetchModelPricing).toHaveBeenCalledOnce()
    expect(mockAihubmixFetchModelPricing).toHaveBeenCalledWith(request)
  })
})
