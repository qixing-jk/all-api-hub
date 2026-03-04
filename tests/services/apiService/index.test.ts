import { beforeEach, describe, expect, it, vi } from "vitest"

import { DONE_HUB, ONE_HUB } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"

const {
  commonFetchUserInfo,
  commonFetchModelPricing,
  commonFetchAccountTokens,
  oneHubFetchModelPricing,
  oneHubFetchAccountTokens,
} = vi.hoisted(() => ({
  commonFetchUserInfo: vi.fn(),
  commonFetchModelPricing: vi.fn(),
  commonFetchAccountTokens: vi.fn(),
  oneHubFetchModelPricing: vi.fn(),
  oneHubFetchAccountTokens: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchUserInfo: commonFetchUserInfo,
  fetchModelPricing: commonFetchModelPricing,
  fetchAccountTokens: commonFetchAccountTokens,
}))

vi.mock("~/services/apiService/oneHub", () => ({
  fetchModelPricing: oneHubFetchModelPricing,
  fetchAccountTokens: oneHubFetchAccountTokens,
  // Intentionally omit fetchUserInfo so getApiFunc falls back to common
}))

describe("apiService index wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should call common implementation by default when no site override provided", async () => {
    commonFetchUserInfo.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "cookie", userId: 1 },
    }

    await (getApiService(undefined).fetchUserInfo as any)(request)

    expect(commonFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(commonFetchUserInfo).toHaveBeenCalledWith(request)
  })

  it("should use override module when selecting a site-scoped api instance", async () => {
    oneHubFetchModelPricing.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
    }
    await (getApiService(ONE_HUB).fetchModelPricing as any)(request)

    expect(oneHubFetchModelPricing).toHaveBeenCalledTimes(1)
    expect(oneHubFetchModelPricing).toHaveBeenCalledWith(request)
  })

  it("should route to override without relying on object siteType detection", async () => {
    oneHubFetchAccountTokens.mockResolvedValue([] as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
    }
    await (getApiService(DONE_HUB).fetchAccountTokens as any)(request)

    expect(oneHubFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(oneHubFetchAccountTokens).toHaveBeenCalledWith(request)
  })

  it("should fall back to common implementation when override module does not implement function", async () => {
    commonFetchUserInfo.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "cookie", userId: 1 },
    }

    await (getApiService(ONE_HUB).fetchUserInfo as any)(request)

    expect(commonFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(commonFetchUserInfo).toHaveBeenCalledWith(request)
  })
})
