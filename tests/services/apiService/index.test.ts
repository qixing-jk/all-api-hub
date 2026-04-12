import { beforeEach, describe, expect, it, vi } from "vitest"

import { DONE_HUB, ONE_HUB, WONG_GONGYI } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"

const {
  commonFetchUserInfo,
  commonFetchModelPricing,
  commonFetchAccountTokens,
  commonResolveApiTokenKey,
  oneHubFetchModelPricing,
  oneHubFetchAccountTokens,
  wongResolveApiTokenKey,
} = vi.hoisted(() => ({
  commonFetchUserInfo: vi.fn(),
  commonFetchModelPricing: vi.fn(),
  commonFetchAccountTokens: vi.fn(),
  commonResolveApiTokenKey: vi.fn(),
  oneHubFetchModelPricing: vi.fn(),
  oneHubFetchAccountTokens: vi.fn(),
  wongResolveApiTokenKey: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchUserInfo: commonFetchUserInfo,
  fetchModelPricing: commonFetchModelPricing,
  fetchAccountTokens: commonFetchAccountTokens,
  resolveApiTokenKey: commonResolveApiTokenKey,
}))

vi.mock("~/services/apiService/oneHub", () => ({
  fetchModelPricing: oneHubFetchModelPricing,
  fetchAccountTokens: oneHubFetchAccountTokens,
  // Intentionally omit fetchUserInfo so getApiFunc falls back to common
}))

vi.mock("~/services/apiService/wong", () => ({
  resolveApiTokenKey: wongResolveApiTokenKey,
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

  it("should detect override sites from the request payload itself", async () => {
    oneHubFetchModelPricing.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
      siteType: ONE_HUB,
    }
    await (getApiService(undefined).fetchModelPricing as any)(request)

    expect(oneHubFetchModelPricing).toHaveBeenCalledTimes(1)
    expect(oneHubFetchModelPricing).toHaveBeenCalledWith(request)
  })

  it("should respect an explicit trailing site hint when using the exported wrapper", async () => {
    oneHubFetchModelPricing.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
    }
    await (getApiService(undefined).fetchModelPricing as any)(request, DONE_HUB)

    expect(oneHubFetchModelPricing).toHaveBeenCalledTimes(1)
    expect(oneHubFetchModelPricing).toHaveBeenCalledWith(request)
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

  it("should route WONG token secret resolution through the site override", async () => {
    wongResolveApiTokenKey.mockResolvedValue("sk-wong-secret")

    const request = {
      baseUrl: "https://wong.example.com",
      auth: { authType: "token", userId: 1 },
    }
    const token = {
      id: 7,
      key: "sk-abcd************wxyz",
    }

    await (getApiService(WONG_GONGYI).resolveApiTokenKey as any)(request, token)

    expect(wongResolveApiTokenKey).toHaveBeenCalledTimes(1)
    expect(wongResolveApiTokenKey).toHaveBeenCalledWith(request, token)
    expect(commonResolveApiTokenKey).not.toHaveBeenCalled()
  })
})
