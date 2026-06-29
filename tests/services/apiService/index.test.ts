import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"

const {
  newApiFamilyFetchUserInfo,
  newApiFamilyCreateAccessToken,
  newApiFamilyGetOrCreateAccessToken,
  newApiFamilyFetchSupportCheckIn,
  newApiFamilyFetchSiteStatus,
  newApiFamilyExtractDefaultExchangeRate,
  newApiFamilyFetchAccountData,
  newApiFamilyFetchAccountQuota,
  newApiFamilyFetchCheckInStatus,
  newApiFamilyFetchTodayUsage,
  newApiFamilyFetchTodayIncome,
  newApiFamilyRefreshAccountData,
  newApiFamilyValidateAccountConnection,
  newApiFamilyFetchAccountAvailableModels,
  newApiFamilyFetchAccountTokens,
  newApiFamilyFetchSiteUserGroups,
  newApiFamilyFetchUserGroups,
  newApiFamilyCreateApiToken,
  newApiFamilyFetchTokenById,
  newApiFamilyUpdateApiToken,
  newApiFamilyDeleteApiToken,
  newApiFamilyResolveApiTokenKey,
  newApiFamilyFetchSiteNotice,
  newApiFamilyFetchModelPricing,
  newApiFamilyRedeemCode,
  aihubmixFetchAccountTokens,
  oneHubFetchModelPricing,
  oneHubFetchAccountTokens,
  wongResolveApiTokenKey,
  sub2apiFetchUserInfo,
  sub2apiExtractDefaultExchangeRate,
  sub2apiFetchSub2ApiRuntimeModels,
  sub2apiFetchSub2ApiAnnouncements,
  sub2apiMarkSub2ApiAnnouncementRead,
  sub2apiFetchAccountTokens,
  sub2apiCreateApiToken,
  sub2apiResolveApiTokenKey,
  sub2apiFetchSupportCheckIn,
  sub2apiRefreshAccountData,
  aihubmixCreateApiToken,
  aihubmixResolveApiTokenKey,
  aihubmixFetchSupportCheckIn,
  aihubmixRefreshAccountData,
} = vi.hoisted(() => ({
  newApiFamilyFetchUserInfo: vi.fn(),
  newApiFamilyCreateAccessToken: vi.fn(),
  newApiFamilyGetOrCreateAccessToken: vi.fn(),
  newApiFamilyFetchSupportCheckIn: vi.fn(),
  newApiFamilyFetchSiteStatus: vi.fn(),
  newApiFamilyExtractDefaultExchangeRate: vi.fn(),
  newApiFamilyFetchAccountData: vi.fn(),
  newApiFamilyFetchAccountQuota: vi.fn(),
  newApiFamilyFetchCheckInStatus: vi.fn(),
  newApiFamilyFetchTodayUsage: vi.fn(),
  newApiFamilyFetchTodayIncome: vi.fn(),
  newApiFamilyRefreshAccountData: vi.fn(),
  newApiFamilyValidateAccountConnection: vi.fn(),
  newApiFamilyFetchAccountAvailableModels: vi.fn(),
  newApiFamilyFetchAccountTokens: vi.fn(),
  newApiFamilyFetchSiteUserGroups: vi.fn(),
  newApiFamilyFetchUserGroups: vi.fn(),
  newApiFamilyCreateApiToken: vi.fn(),
  newApiFamilyFetchTokenById: vi.fn(),
  newApiFamilyUpdateApiToken: vi.fn(),
  newApiFamilyDeleteApiToken: vi.fn(),
  newApiFamilyResolveApiTokenKey: vi.fn(),
  newApiFamilyFetchSiteNotice: vi.fn(),
  newApiFamilyFetchModelPricing: vi.fn(),
  newApiFamilyRedeemCode: vi.fn(),
  aihubmixFetchAccountTokens: vi.fn(),
  oneHubFetchModelPricing: vi.fn(),
  oneHubFetchAccountTokens: vi.fn(),
  wongResolveApiTokenKey: vi.fn(),
  sub2apiFetchUserInfo: vi.fn(),
  sub2apiExtractDefaultExchangeRate: vi.fn(),
  sub2apiFetchSub2ApiRuntimeModels: vi.fn(),
  sub2apiFetchSub2ApiAnnouncements: vi.fn(),
  sub2apiMarkSub2ApiAnnouncementRead: vi.fn(),
  sub2apiFetchAccountTokens: vi.fn(),
  sub2apiCreateApiToken: vi.fn(),
  sub2apiResolveApiTokenKey: vi.fn(),
  sub2apiFetchSupportCheckIn: vi.fn(),
  sub2apiRefreshAccountData: vi.fn(),
  aihubmixCreateApiToken: vi.fn(),
  aihubmixResolveApiTokenKey: vi.fn(),
  aihubmixFetchSupportCheckIn: vi.fn(),
  aihubmixRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({}))

vi.mock("~/services/apiService/newApiFamily/default/accountBootstrap", () => ({
  fetchUserInfo: newApiFamilyFetchUserInfo,
  createAccessToken: newApiFamilyCreateAccessToken,
  getOrCreateAccessToken: newApiFamilyGetOrCreateAccessToken,
  fetchSupportCheckIn: newApiFamilyFetchSupportCheckIn,
  fetchSiteStatus: newApiFamilyFetchSiteStatus,
  extractDefaultExchangeRate: newApiFamilyExtractDefaultExchangeRate,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  fetchAccountQuota: newApiFamilyFetchAccountQuota,
  fetchCheckInStatus: newApiFamilyFetchCheckInStatus,
  fetchTodayUsage: newApiFamilyFetchTodayUsage,
  fetchTodayIncome: newApiFamilyFetchTodayIncome,
  fetchAccountData: newApiFamilyFetchAccountData,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountRefresh", () => ({
  refreshAccountData: newApiFamilyRefreshAccountData,
  validateAccountConnection: newApiFamilyValidateAccountConnection,
}))

vi.mock("~/services/apiService/newApiFamily/default/keyManagement", () => ({
  fetchAccountTokens: newApiFamilyFetchAccountTokens,
  fetchAccountAvailableModels: newApiFamilyFetchAccountAvailableModels,
  fetchUserGroups: newApiFamilyFetchUserGroups,
  fetchSiteUserGroups: newApiFamilyFetchSiteUserGroups,
  createApiToken: newApiFamilyCreateApiToken,
  fetchTokenById: newApiFamilyFetchTokenById,
  updateApiToken: newApiFamilyUpdateApiToken,
  deleteApiToken: newApiFamilyDeleteApiToken,
  resolveApiTokenKey: newApiFamilyResolveApiTokenKey,
}))

vi.mock("~/services/apiService/newApiFamily/default/siteNotice", () => ({
  fetchSiteNotice: newApiFamilyFetchSiteNotice,
}))

vi.mock("~/services/apiService/newApiFamily/default/modelPricing", () => ({
  fetchModelPricing: newApiFamilyFetchModelPricing,
}))

vi.mock("~/services/apiService/newApiFamily/default/redemption", () => ({
  redeemCode: newApiFamilyRedeemCode,
}))

vi.mock("~/services/apiService/oneHub", () => ({
  fetchModelPricing: oneHubFetchModelPricing,
  fetchAccountTokens: oneHubFetchAccountTokens,
  // Intentionally omit fetchUserInfo so getApiFunc falls back to the default bootstrap implementation.
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchAccountTokens: aihubmixFetchAccountTokens,
  createApiToken: aihubmixCreateApiToken,
  resolveApiTokenKey: aihubmixResolveApiTokenKey,
  fetchSupportCheckIn: aihubmixFetchSupportCheckIn,
  refreshAccountData: aihubmixRefreshAccountData,
}))

vi.mock("~/services/apiService/wong", () => ({
  resolveApiTokenKey: wongResolveApiTokenKey,
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchUserInfo: sub2apiFetchUserInfo,
  extractDefaultExchangeRate: sub2apiExtractDefaultExchangeRate,
  fetchSub2ApiRuntimeModels: sub2apiFetchSub2ApiRuntimeModels,
  fetchSub2ApiAnnouncements: sub2apiFetchSub2ApiAnnouncements,
  markSub2ApiAnnouncementRead: sub2apiMarkSub2ApiAnnouncementRead,
  fetchAccountTokens: sub2apiFetchAccountTokens,
  createApiToken: sub2apiCreateApiToken,
  resolveApiTokenKey: sub2apiResolveApiTokenKey,
  fetchSupportCheckIn: sub2apiFetchSupportCheckIn,
  refreshAccountData: sub2apiRefreshAccountData,
  // Intentionally omit fetchModelPricing so strict override behavior can be asserted.
}))

describe("apiService index wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should call New API-family bootstrap implementation by default when no site override provided", async () => {
    newApiFamilyFetchUserInfo.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "cookie", userId: 1 },
    }

    await (getApiService(undefined).fetchUserInfo as any)(request)

    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledWith(request)
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
    newApiFamilyFetchUserInfo.mockResolvedValue({} as any)

    const request = Object.assign(
      Object.create({ siteType: SITE_TYPES.ONE_HUB }),
      {
        baseUrl: "https://example.com",
        auth: { authType: "none" },
      },
    )

    await (getApiService(undefined).fetchUserInfo as any)(request)

    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledWith(request)
  })

  it("should ignore non-site trailing selector values", async () => {
    newApiFamilyFetchUserInfo.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "none" },
    }

    await (getApiService("toString").fetchUserInfo as any)(request)

    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledWith(request)
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

  it("should fall back to New API-family bootstrap implementation when override module does not implement function", async () => {
    newApiFamilyFetchUserInfo.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://example.com",
      auth: { authType: "cookie", userId: 1 },
    }

    await (getApiService(SITE_TYPES.ONE_HUB).fetchUserInfo as any)(request)

    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledWith(request)
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
    expect(newApiFamilyResolveApiTokenKey).not.toHaveBeenCalled()
  })

  it("should keep migrated managed-channel helpers out of the legacy apiService facade", () => {
    const helperNames = [
      "searchChannel",
      "createChannel",
      "updateChannel",
      "deleteChannel",
      "listAllChannels",
      "fetchChannelModels",
      "updateChannelModels",
      "updateChannelModelMapping",
    ]

    for (const helperName of helperNames) {
      expect(helperName in (getApiService(undefined) as any)).toBe(false)
      expect(helperName in (getApiService(SITE_TYPES.NEW_API) as any)).toBe(
        false,
      )
      expect(helperName in (getApiService(SITE_TYPES.V_API) as any)).toBe(false)
      expect(helperName in (getApiService(SITE_TYPES.DONE_HUB) as any)).toBe(
        false,
      )
      expect(helperName in (getApiService(SITE_TYPES.VELOERA) as any)).toBe(
        false,
      )
    }
  })

  it("should route New API-family account lifecycle calls through explicit lifecycle module overrides", async () => {
    newApiFamilyFetchAccountData.mockResolvedValue({ quota: 1 })
    newApiFamilyRefreshAccountData.mockResolvedValue({ success: true })
    newApiFamilyValidateAccountConnection.mockResolvedValue(true)

    const request = {
      baseUrl: "https://new-api.example.com",
      auth: { authType: "access_token", userId: "1", accessToken: "token" },
      checkIn: { enableDetection: false, siteStatus: {} },
      includeTodayCashflow: false,
    }

    await (getApiService(SITE_TYPES.NEW_API).fetchAccountData as any)(request)
    await (getApiService(SITE_TYPES.V_API).refreshAccountData as any)(request)
    await (getApiService(undefined).validateAccountConnection as any)(request)

    expect(newApiFamilyFetchAccountData).toHaveBeenCalledWith(request)
    expect(newApiFamilyRefreshAccountData).toHaveBeenCalledWith(request)
    expect(newApiFamilyValidateAccountConnection).toHaveBeenCalledWith(request)
  })

  it("should route New API-family bootstrap calls through explicit bootstrap module overrides", async () => {
    newApiFamilyFetchUserInfo.mockResolvedValue({ id: "1" })
    newApiFamilyCreateAccessToken.mockResolvedValue("created-token")
    newApiFamilyGetOrCreateAccessToken.mockResolvedValue({
      username: "Example User",
      access_token: "created-token",
    })
    newApiFamilyFetchSupportCheckIn.mockResolvedValue(true)

    const request = {
      baseUrl: "https://new-api.example.com",
      auth: { authType: "cookie", userId: "1" },
    }

    await (getApiService(SITE_TYPES.NEW_API).fetchUserInfo as any)(request)
    await (getApiService(SITE_TYPES.V_API).createAccessToken as any)(request)
    await (getApiService(undefined).getOrCreateAccessToken as any)(request)
    await (getApiService(undefined).fetchSupportCheckIn as any)(request)

    expect(newApiFamilyFetchUserInfo).toHaveBeenCalledWith(request)
    expect(newApiFamilyCreateAccessToken).toHaveBeenCalledWith(request)
    expect(newApiFamilyGetOrCreateAccessToken).toHaveBeenCalledWith(request)
    expect(newApiFamilyFetchSupportCheckIn).toHaveBeenCalledWith(request)
  })

  it("should route New API-family key-management calls through the explicit key module override", async () => {
    newApiFamilyFetchAccountTokens.mockResolvedValue([])
    newApiFamilyResolveApiTokenKey.mockResolvedValue("sk-new-api-secret")

    const request = {
      baseUrl: "https://new-api.example.com",
      auth: { authType: "access_token", userId: "1", accessToken: "token" },
    }
    const token = {
      id: 9,
      key: "sk-abcd************wxyz",
    }

    await (getApiService(SITE_TYPES.NEW_API).fetchAccountTokens as any)(
      request,
      3,
      25,
    )
    await (getApiService(SITE_TYPES.V_API).resolveApiTokenKey as any)(
      request,
      token,
    )

    expect(newApiFamilyFetchAccountTokens).toHaveBeenCalledWith(request, 3, 25)
    expect(newApiFamilyResolveApiTokenKey).toHaveBeenCalledWith(request, token)
  })

  it("should route AIHubMix account token calls through the site override", async () => {
    aihubmixFetchAccountTokens.mockResolvedValue([])

    const request = {
      baseUrl: "https://aihubmix.com",
      auth: { authType: "access_token", userId: "1", accessToken: "token" },
    }

    await (getApiService(SITE_TYPES.AIHUBMIX).fetchAccountTokens as any)(
      request,
    )

    expect(aihubmixFetchAccountTokens).toHaveBeenCalledTimes(1)
    expect(aihubmixFetchAccountTokens).toHaveBeenCalledWith(request)
    expect(newApiFamilyFetchAccountTokens).not.toHaveBeenCalled()
  })

  it("should keep account capability facts out of the legacy apiService facade", () => {
    expect("capabilities" in (getApiService(undefined) as any)).toBe(false)
    expect("capabilities" in (getApiService(SITE_TYPES.ONE_HUB) as any)).toBe(
      false,
    )
    expect("capabilities" in (getApiService(SITE_TYPES.SUB2API) as any)).toBe(
      false,
    )
    expect("capabilities" in (getApiService(SITE_TYPES.AIHUBMIX) as any)).toBe(
      false,
    )
  })

  it("should keep key-management default implementation objects out of the legacy apiService facade", () => {
    expect(
      "defaultKeyManagementImplementation" in (getApiService(undefined) as any),
    ).toBe(false)
    expect(
      "defaultKeyManagementImplementation" in
        (getApiService(SITE_TYPES.NEW_API) as any),
    ).toBe(false)
  })

  it("should keep account lifecycle default implementation objects out of the legacy apiService facade", () => {
    expect(
      "defaultAccountBootstrapImplementation" in getApiService(undefined),
    ).toBe(false)
    expect("defaultAccountDataImplementation" in getApiService(undefined)).toBe(
      false,
    )
    expect(
      "defaultAccountRefreshImplementation" in getApiService(undefined),
    ).toBe(false)
    expect(
      "defaultAccountBootstrapImplementation" in
        getApiService(SITE_TYPES.NEW_API),
    ).toBe(false)
    expect(
      "defaultAccountDataImplementation" in getApiService(SITE_TYPES.NEW_API),
    ).toBe(false)
    expect(
      "defaultAccountRefreshImplementation" in
        getApiService(SITE_TYPES.NEW_API),
    ).toBe(false)
  })

  it("should not silently fall back to common for missing AIHubMix overrides", async () => {
    newApiFamilyFetchModelPricing.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://aihubmix.com",
      auth: { authType: "access_token", userId: "1", accessToken: "token" },
    }

    expect(() =>
      (getApiService(SITE_TYPES.AIHUBMIX).fetchModelPricing as any)(request),
    ).toThrow(
      `apiService.fetchModelPricing is not implemented for ${SITE_TYPES.AIHUBMIX}`,
    )

    expect(newApiFamilyFetchModelPricing).not.toHaveBeenCalled()
  })

  it("should route Sub2API fetchUserInfo through the site override", async () => {
    sub2apiFetchUserInfo.mockResolvedValue({ id: "7" } as any)

    const request = {
      baseUrl: "https://sub2.example.com",
      auth: { authType: "access_token", accessToken: "jwt-token" },
    }

    await (getApiService(SITE_TYPES.SUB2API).fetchUserInfo as any)(request)

    expect(sub2apiFetchUserInfo).toHaveBeenCalledTimes(1)
    expect(sub2apiFetchUserInfo).toHaveBeenCalledWith(request)
    expect(newApiFamilyFetchUserInfo).not.toHaveBeenCalled()
  })

  it("should route Sub2API exchange-rate extraction through the site override", () => {
    sub2apiExtractDefaultExchangeRate.mockReturnValue(7.2)

    const siteStatus = {
      checkin_enabled: false,
      price: 7.2,
    }

    const rate = (
      getApiService(SITE_TYPES.SUB2API).extractDefaultExchangeRate as any
    )(siteStatus)

    expect(rate).toBe(7.2)
    expect(sub2apiExtractDefaultExchangeRate).toHaveBeenCalledTimes(1)
    expect(sub2apiExtractDefaultExchangeRate).toHaveBeenCalledWith(siteStatus)
    expect(newApiFamilyExtractDefaultExchangeRate).not.toHaveBeenCalled()
  })

  it("should not silently fall back to common for missing Sub2API overrides", async () => {
    newApiFamilyFetchModelPricing.mockResolvedValue({} as any)

    const request = {
      baseUrl: "https://sub2.example.com",
      auth: { authType: "access_token", accessToken: "jwt-token" },
    }

    expect(() =>
      (getApiService(SITE_TYPES.SUB2API).fetchModelPricing as any)(request),
    ).toThrow(
      `apiService.fetchModelPricing is not implemented for ${SITE_TYPES.SUB2API}`,
    )

    expect(newApiFamilyFetchModelPricing).not.toHaveBeenCalled()
  })
})
