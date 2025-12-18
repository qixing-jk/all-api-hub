import { beforeEach, describe, expect, it, vi } from "vitest"

import { DONE_HUB, ONE_HUB } from "~/constants/siteType"

const commonFetchUserInfo = vi.fn()
const commonFetchModelPricing = vi.fn()
const commonFetchAccountTokens = vi.fn()

const oneHubFetchModelPricing = vi.fn()
const oneHubFetchAccountTokens = vi.fn()

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
    vi.resetModules()
  })

  it("should call common implementation by default when no site override provided", async () => {
    const { getApiService } = await import("~/services/apiService")
    commonFetchUserInfo.mockResolvedValue({} as any)

    await (getApiService(undefined).fetchUserInfo as any)(
      "https://example.com",
      1,
    )

    expect(commonFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(commonFetchUserInfo).toHaveBeenCalledWith("https://example.com", 1)
  })

  it("should use override module when selecting a site-scoped api instance", async () => {
    const { getApiService } = await import("~/services/apiService")
    oneHubFetchModelPricing.mockResolvedValue({} as any)

    await (getApiService(ONE_HUB).fetchModelPricing as any)({ foo: "bar" })

    expect(oneHubFetchModelPricing).toHaveBeenCalledTimes(1)
    expect(oneHubFetchModelPricing).toHaveBeenCalledWith({ foo: "bar" })
  })

  it("should route to override without relying on object siteType detection", async () => {
    const { getApiService } = await import("~/services/apiService")
    oneHubFetchAccountTokens.mockResolvedValue([] as any)

    await (getApiService(DONE_HUB).fetchAccountTokens as any)({ foo: "bar" })

    expect(oneHubFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(oneHubFetchAccountTokens).toHaveBeenCalledWith({ foo: "bar" })
  })

  it("should fall back to common implementation when override module does not implement function", async () => {
    const { getApiService } = await import("~/services/apiService")
    commonFetchUserInfo.mockResolvedValue({} as any)

    await (getApiService(ONE_HUB).fetchUserInfo as any)(
      "https://example.com",
      1,
    )

    expect(commonFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(commonFetchUserInfo).toHaveBeenCalledWith("https://example.com", 1)
  })
})
