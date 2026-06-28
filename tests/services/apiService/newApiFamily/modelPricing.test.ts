import { beforeEach, describe, expect, it, vi } from "vitest"

import { defaultModelPricingImplementation } from "~/services/apiService/newApiFamily/default/modelPricing"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import { AuthTypeEnum } from "~/types"

const { fetchApiMock, loggerErrorMock } = vi.hoisted(() => ({
  fetchApiMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: fetchApiMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
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

  it("fetches New API-family model pricing from the pricing endpoint", async () => {
    fetchApiMock.mockResolvedValueOnce(pricingResponse)

    const modelPricing = defaultModelPricingImplementation

    await expect(modelPricing.fetchModelPricing(request)).resolves.toBe(
      pricingResponse,
    )

    expect(fetchApiMock).toHaveBeenCalledWith(
      request,
      { endpoint: "/api/pricing" },
      true,
    )
  })

  it("rethrows pricing endpoint failures", async () => {
    const error = new Error("pricing unavailable")
    fetchApiMock.mockRejectedValueOnce(error)

    await expect(
      defaultModelPricingImplementation.fetchModelPricing(request),
    ).rejects.toBe(error)
    expect(loggerErrorMock).toHaveBeenCalledWith("获取模型定价失败", error)
  })
})
