import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import { aihubmixAccountBootstrap } from "~/services/apiAdapters/aihubmix/accountBootstrap"
import { ACCOUNT_BOOTSTRAP_ROUTE_KINDS } from "~/services/apiAdapters/contracts/accountBootstrap"
import { createNewApiAccountBootstrap } from "~/services/apiAdapters/newApi/accountBootstrap"
import { sub2ApiAccountBootstrap } from "~/services/apiAdapters/sub2api/accountBootstrap"
import { AuthTypeEnum } from "~/types"

const {
  mockAihubmixExtractDefaultExchangeRate,
  mockAihubmixFetchSiteStatus,
  mockAihubmixFetchSupportCheckIn,
  mockAihubmixFetchUserInfo,
  mockAihubmixGetOrCreateAccessToken,
  mockExtractDefaultExchangeRate,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockFetchUserInfo,
  mockGetApiService,
  mockGetOrCreateAccessToken,
  mockSub2ApiExtractDefaultExchangeRate,
  mockSub2ApiFetchSiteStatus,
  mockSub2ApiFetchSupportCheckIn,
  mockSub2ApiFetchUserInfo,
  mockSub2ApiGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockAihubmixExtractDefaultExchangeRate: vi.fn(),
  mockAihubmixFetchSiteStatus: vi.fn(),
  mockAihubmixFetchSupportCheckIn: vi.fn(),
  mockAihubmixFetchUserInfo: vi.fn(),
  mockAihubmixGetOrCreateAccessToken: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetApiService: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
  mockSub2ApiExtractDefaultExchangeRate: vi.fn(),
  mockSub2ApiFetchSiteStatus: vi.fn(),
  mockSub2ApiFetchSupportCheckIn: vi.fn(),
  mockSub2ApiFetchUserInfo: vi.fn(),
  mockSub2ApiGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/sub2api", () => ({
  extractDefaultExchangeRate: mockSub2ApiExtractDefaultExchangeRate,
  fetchSiteStatus: mockSub2ApiFetchSiteStatus,
  fetchSupportCheckIn: mockSub2ApiFetchSupportCheckIn,
  fetchUserInfo: mockSub2ApiFetchUserInfo,
  getOrCreateAccessToken: mockSub2ApiGetOrCreateAccessToken,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  extractDefaultExchangeRate: mockAihubmixExtractDefaultExchangeRate,
  fetchSiteStatus: mockAihubmixFetchSiteStatus,
  fetchSupportCheckIn: mockAihubmixFetchSupportCheckIn,
  fetchUserInfo: mockAihubmixFetchUserInfo,
  getOrCreateAccessToken: mockAihubmixGetOrCreateAccessToken,
}))

const request = {
  baseUrl: "https://example.invalid",
  auth: { authType: AuthTypeEnum.Cookie },
}
const userInfo = { id: 1, username: "tester" }
const tokenInfo = { username: "tester", access_token: "token" }
const siteStatus = { system_name: "Example Portal", checkin_enabled: true }

describe("account bootstrap adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates New API-family bootstrap operations to the site API service", async () => {
    const accountBootstrap = createNewApiAccountBootstrap(SITE_TYPES.VELOERA)
    mockGetApiService.mockReturnValue({
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchSiteStatus: mockFetchSiteStatus,
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      fetchUserInfo: mockFetchUserInfo,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
    })
    mockFetchUserInfo.mockResolvedValue(userInfo)
    mockGetOrCreateAccessToken.mockResolvedValue(tokenInfo)
    mockFetchSiteStatus.mockResolvedValue(siteStatus)
    mockFetchSupportCheckIn.mockResolvedValue(true)
    mockExtractDefaultExchangeRate.mockReturnValue(500000)

    await expect(accountBootstrap.fetchUserInfo(request)).resolves.toBe(
      userInfo,
    )
    await expect(
      accountBootstrap.getOrCreateAccessToken(request),
    ).resolves.toBe(tokenInfo)
    await expect(accountBootstrap.fetchSiteStatus(request)).resolves.toBe(
      siteStatus,
    )
    await expect(accountBootstrap.fetchCheckInSupport(request)).resolves.toBe(
      true,
    )
    expect(accountBootstrap.extractDefaultExchangeRate(siteStatus)).toBe(500000)
    await expect(
      accountBootstrap.resolveRoutePath(
        { baseUrl: "https://example.invalid", siteType: SITE_TYPES.VELOERA },
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBe("/app/me")

    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.VELOERA)
    expect(mockFetchUserInfo).toHaveBeenCalledWith(request)
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith(request)
    expect(mockFetchSiteStatus).toHaveBeenCalledWith(request)
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(request)
    expect(mockExtractDefaultExchangeRate).toHaveBeenCalledWith(siteStatus)
  })

  it("resolves static account route paths from shared route kinds", () => {
    const target = {
      baseUrl: "https://sub2.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    }

    expect(
      resolveStaticAccountRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login,
      ),
    ).toBe("/login")
    expect(
      resolveStaticAccountRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Usage,
      ),
    ).toBe("/usage")
    expect(
      resolveStaticAccountRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.CheckIn,
      ),
    ).toBe("/console/personal")
    expect(
      resolveStaticAccountRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.AdminCredentials,
      ),
    ).toBe("/console/personal")
    expect(
      resolveStaticAccountRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Redeem,
      ),
    ).toBe("/redeem")
    expect(
      resolveStaticAccountRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.SiteAnnouncements,
      ),
    ).toBe("/dashboard")
  })

  it("delegates Sub2API bootstrap operations to Sub2API helpers", async () => {
    mockSub2ApiFetchUserInfo.mockResolvedValue(userInfo)
    mockSub2ApiGetOrCreateAccessToken.mockResolvedValue(tokenInfo)
    mockSub2ApiFetchSiteStatus.mockResolvedValue(siteStatus)
    mockSub2ApiFetchSupportCheckIn.mockResolvedValue(false)
    mockSub2ApiExtractDefaultExchangeRate.mockReturnValue(1000000)

    await expect(sub2ApiAccountBootstrap.fetchUserInfo(request)).resolves.toBe(
      userInfo,
    )
    await expect(
      sub2ApiAccountBootstrap.getOrCreateAccessToken(request),
    ).resolves.toBe(tokenInfo)
    await expect(
      sub2ApiAccountBootstrap.fetchSiteStatus(request),
    ).resolves.toBe(siteStatus)
    await expect(
      sub2ApiAccountBootstrap.fetchCheckInSupport(request),
    ).resolves.toBe(false)
    expect(sub2ApiAccountBootstrap.extractDefaultExchangeRate(siteStatus)).toBe(
      1000000,
    )
    await expect(
      sub2ApiAccountBootstrap.resolveRoutePath(
        {
          baseUrl: "https://sub2.example.invalid",
          siteType: SITE_TYPES.SUB2API,
        },
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login,
      ),
    ).resolves.toBe("/login")
    await expect(
      sub2ApiAccountBootstrap.resolveRoutePath(
        {
          baseUrl: "https://sub2.example.invalid",
          siteType: SITE_TYPES.SUB2API,
        },
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.SiteAnnouncements,
      ),
    ).resolves.toBe("/dashboard")

    expect(mockSub2ApiFetchUserInfo).toHaveBeenCalledWith(request)
    expect(mockSub2ApiGetOrCreateAccessToken).toHaveBeenCalledWith(request)
    expect(mockSub2ApiFetchSiteStatus).toHaveBeenCalledWith(request)
    expect(mockSub2ApiFetchSupportCheckIn).toHaveBeenCalledWith(request)
    expect(mockSub2ApiExtractDefaultExchangeRate).toHaveBeenCalledWith(
      siteStatus,
    )
    expect(mockGetApiService).not.toHaveBeenCalled()
  })

  it("delegates AIHubMix bootstrap operations to AIHubMix helpers", async () => {
    mockAihubmixFetchUserInfo.mockResolvedValue(userInfo)
    mockAihubmixGetOrCreateAccessToken.mockResolvedValue(tokenInfo)
    mockAihubmixFetchSiteStatus.mockResolvedValue(siteStatus)
    mockAihubmixFetchSupportCheckIn.mockResolvedValue(undefined)
    mockAihubmixExtractDefaultExchangeRate.mockReturnValue(null)

    await expect(aihubmixAccountBootstrap.fetchUserInfo(request)).resolves.toBe(
      userInfo,
    )
    await expect(
      aihubmixAccountBootstrap.getOrCreateAccessToken(request),
    ).resolves.toBe(tokenInfo)
    await expect(
      aihubmixAccountBootstrap.fetchSiteStatus(request),
    ).resolves.toBe(siteStatus)
    await expect(
      aihubmixAccountBootstrap.fetchCheckInSupport(request),
    ).resolves.toBeUndefined()
    expect(
      aihubmixAccountBootstrap.extractDefaultExchangeRate(siteStatus),
    ).toBe(null)
    await expect(
      aihubmixAccountBootstrap.resolveRoutePath(
        {
          baseUrl: "https://aihubmix.example.invalid",
          siteType: SITE_TYPES.AIHUBMIX,
        },
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login,
      ),
    ).resolves.toBe("/sign-in")

    expect(mockAihubmixFetchUserInfo).toHaveBeenCalledWith(request)
    expect(mockAihubmixGetOrCreateAccessToken).toHaveBeenCalledWith(request)
    expect(mockAihubmixFetchSiteStatus).toHaveBeenCalledWith(request)
    expect(mockAihubmixFetchSupportCheckIn).toHaveBeenCalledWith(request)
    expect(mockAihubmixExtractDefaultExchangeRate).toHaveBeenCalledWith(
      siteStatus,
    )
    expect(mockGetApiService).not.toHaveBeenCalled()
  })
})
