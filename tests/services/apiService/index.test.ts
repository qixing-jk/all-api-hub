import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"

const {
  commonFetchUserInfo,
  commonFetchModelPricing,
  commonFetchAccountTokens,
  commonResolveApiTokenKey,
  aihubmixFetchAccountTokens,
  oneHubFetchModelPricing,
  oneHubFetchAccountTokens,
  wongResolveApiTokenKey,
} = vi.hoisted(() => ({
  commonFetchUserInfo: vi.fn(),
  commonFetchModelPricing: vi.fn(),
  commonFetchAccountTokens: vi.fn(),
  commonResolveApiTokenKey: vi.fn(),
  aihubmixFetchAccountTokens: vi.fn(),
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

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchAccountTokens: aihubmixFetchAccountTokens,
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
    await (getApiService(SITE_TYPES.ONE_HUB).fetchModelPricing as any)(request)

    expect(oneHubFetchModelPricing).toHaveBeenCalledTimes(1)
    expect(oneHubFetchModelPricing).toHaveBeenCalledWith(request)
  })

  it("should route to override without relying on object siteType detection", async () => {
    oneHubFetchAccountTokens.mockResolvedValue([] as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
    }
    await (getApiService(SITE_TYPES.DONE_HUB).fetchAccountTokens as any)(
      request,
    )

    expect(oneHubFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(oneHubFetchAccountTokens).toHaveBeenCalledWith(request)
  })

  it("should detect override sites from the request payload itself", async () => {
    oneHubFetchModelPricing.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
      siteType: SITE_TYPES.ONE_HUB,
    }
    await (getApiService(undefined).fetchModelPricing as any)(request)

    expect(oneHubFetchModelPricing).toHaveBeenCalledTimes(1)
    expect(oneHubFetchModelPricing).toHaveBeenCalledWith(request)
  })

  it("should ignore prototype-inherited siteType when detecting override sites", async () => {
    commonFetchUserInfo.mockResolvedValue({} as any)

    const request = Object.assign(
      Object.create({ siteType: SITE_TYPES.ONE_HUB }),
      {
        baseUrl: "https://example.com",
        auth: { authType: "none" },
      },
    )

    await (getApiService(undefined).fetchUserInfo as any)(request)

    expect(commonFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(commonFetchUserInfo).toHaveBeenCalledWith(request)
  })

  it("should ignore non-site trailing selector values", async () => {
    commonFetchUserInfo.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
    }

    await (getApiService("toString").fetchUserInfo as any)(request)

    expect(commonFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(commonFetchUserInfo).toHaveBeenCalledWith(request)
  })

  it("should respect an explicit trailing site hint when using the exported wrapper", async () => {
    oneHubFetchModelPricing.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
    }
    await (getApiService(undefined).fetchModelPricing as any)(
      request,
      SITE_TYPES.DONE_HUB,
    )

    expect(oneHubFetchModelPricing).toHaveBeenCalledTimes(1)
    expect(oneHubFetchModelPricing).toHaveBeenCalledWith(request)
  })

  it("should fall back to common implementation when override module does not implement function", async () => {
    commonFetchUserInfo.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "cookie", userId: 1 },
    }

    await (getApiService(SITE_TYPES.ONE_HUB).fetchUserInfo as any)(request)

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

    await (getApiService(SITE_TYPES.WONG_GONGYI).resolveApiTokenKey as any)(
      request,
      token,
    )

    expect(wongResolveApiTokenKey).toHaveBeenCalledTimes(1)
    expect(wongResolveApiTokenKey).toHaveBeenCalledWith(request, token)
    expect(commonResolveApiTokenKey).not.toHaveBeenCalled()
  })

  it("should route AIHubMix account token calls through the site override", async () => {
    aihubmixFetchAccountTokens.mockResolvedValue([])

    const request = {
      baseUrl: "https://aihubmix.com",
      auth: { authType: "access_token", userId: 1, accessToken: "token" },
    }

    await (getApiService(SITE_TYPES.AIHUBMIX).fetchAccountTokens as any)(
      request,
    )

    expect(aihubmixFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(aihubmixFetchAccountTokens).toHaveBeenCalledWith(request)
    expect(commonFetchAccountTokens).not.toHaveBeenCalled()
  })

  it("should not silently fall back to common for missing AIHubMix overrides", async () => {
    commonFetchModelPricing.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://aihubmix.com",
      auth: { authType: "access_token", userId: 1, accessToken: "token" },
    }

    expect(() =>
      (getApiService(SITE_TYPES.AIHUBMIX).fetchModelPricing as any)(request),
    ).toThrow(
      `apiService.fetchModelPricing is not implemented for ${SITE_TYPES.AIHUBMIX}`,
    )

    expect(commonFetchModelPricing).not.toHaveBeenCalled()
  })
})
