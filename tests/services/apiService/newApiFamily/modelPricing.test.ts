import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createModelPricingImplementation } from "~/services/apiService/newApiFamily/modelPricing"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import { AuthTypeEnum } from "~/types"

const { commonFetchModelPricing, oneHubFetchModelPricing } = vi.hoisted(() => ({
  commonFetchModelPricing: vi.fn(),
  oneHubFetchModelPricing: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchModelPricing: commonFetchModelPricing,
}))

vi.mock("~/services/apiService/oneHub", () => ({
  fetchModelPricing: oneHubFetchModelPricing,
}))

const request = {
  baseUrl: "https://pricing.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
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

describe("newApiFamily modelPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses common-compatible model pricing by default for New API-family sites", async () => {
    commonFetchModelPricing.mockResolvedValueOnce(pricingResponse)

    const modelPricing = createModelPricingImplementation(SITE_TYPES.NEW_API)

    await expect(modelPricing.fetchModelPricing(request)).resolves.toBe(
      pricingResponse,
    )

    expect(commonFetchModelPricing).toHaveBeenCalledOnce()
    expect(commonFetchModelPricing).toHaveBeenCalledWith(request)
    expect(oneHubFetchModelPricing).not.toHaveBeenCalled()
  })

  it.each([SITE_TYPES.ONE_HUB, SITE_TYPES.DONE_HUB])(
    "uses OneHub-family model pricing for %s",
    async (siteType) => {
      oneHubFetchModelPricing.mockResolvedValueOnce(pricingResponse)

      const modelPricing = createModelPricingImplementation(siteType)

      await expect(modelPricing.fetchModelPricing(request)).resolves.toBe(
        pricingResponse,
      )

      expect(oneHubFetchModelPricing).toHaveBeenCalledOnce()
      expect(oneHubFetchModelPricing).toHaveBeenCalledWith(request)
      expect(commonFetchModelPricing).not.toHaveBeenCalled()
    },
  )
})
