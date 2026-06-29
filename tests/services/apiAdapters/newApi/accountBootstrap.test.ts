import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS,
  type AccountBootstrapRouteTarget,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { createNewApiAccountBootstrap } from "~/services/apiAdapters/newApi/accountBootstrap"
import { AuthTypeEnum } from "~/types"

const {
  anyrouterFetchSupportCheckIn,
  mockExtractDefaultExchangeRate,
  mockFetchCheckInSupport,
  mockFetchSiteStatus,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
  wongFetchSupportCheckIn,
} = vi.hoisted(() => ({
  anyrouterFetchSupportCheckIn: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchCheckInSupport: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
  wongFetchSupportCheckIn: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/accountBootstrap", () => ({
  defaultAccountBootstrapImplementation: {
    extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    fetchSupportCheckIn: mockFetchCheckInSupport,
    fetchSiteStatus: mockFetchSiteStatus,
    fetchUserInfo: mockFetchUserInfo,
    getOrCreateAccessToken: mockGetOrCreateAccessToken,
  },
}))

vi.mock("~/services/apiService/newApiFamily/variants/anyrouter", () => ({
  fetchSupportCheckIn: anyrouterFetchSupportCheckIn,
}))

vi.mock("~/services/apiService/newApiFamily/variants/wong", () => ({
  fetchSupportCheckIn: wongFetchSupportCheckIn,
}))

const request = {
  baseUrl: "https://bootstrap.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
}

describe("createNewApiAccountBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates New API-family bootstrap operations through the New API-family implementation", async () => {
    const userInfo = {
      id: "user-1",
      username: "Example User",
      access_token: "access-token",
    }
    const accessToken = {
      username: "Example User",
      access_token: "created-token",
    }
    const siteStatus = {
      system_name: "Example API",
      checkin_enabled: true,
      price: 7.2,
    }
    mockFetchUserInfo.mockResolvedValueOnce(userInfo)
    mockGetOrCreateAccessToken.mockResolvedValueOnce(accessToken)
    mockFetchSiteStatus.mockResolvedValueOnce(siteStatus)
    mockFetchCheckInSupport.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(7.2)

    const accountBootstrap = createNewApiAccountBootstrap(SITE_TYPES.VELOERA)

    await expect(accountBootstrap.fetchUserInfo(request)).resolves.toBe(
      userInfo,
    )
    await expect(
      accountBootstrap.getOrCreateAccessToken(request),
    ).resolves.toBe(accessToken)
    await expect(accountBootstrap.fetchSiteStatus(request)).resolves.toBe(
      siteStatus,
    )
    await expect(accountBootstrap.fetchCheckInSupport(request)).resolves.toBe(
      true,
    )
    expect(accountBootstrap.extractDefaultExchangeRate(siteStatus)).toBe(7.2)

    expect(mockFetchUserInfo).toHaveBeenCalledWith(request)
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith(request)
    expect(mockFetchSiteStatus).toHaveBeenCalledWith(request)
    expect(mockFetchCheckInSupport).toHaveBeenCalledWith(request)
    expect(mockExtractDefaultExchangeRate).toHaveBeenCalledWith(siteStatus)
  })

  it("keeps account route resolution on the static account route helper", async () => {
    const accountBootstrap = createNewApiAccountBootstrap(SITE_TYPES.NEW_API)
    const target: AccountBootstrapRouteTarget = {
      baseUrl: "https://new.example.invalid",
      siteType: SITE_TYPES.NEW_API,
    }

    await expect(
      accountBootstrap.resolveRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login,
      ),
    ).resolves.toBe("/login")
  })

  it.each([
    [SITE_TYPES.ANYROUTER, anyrouterFetchSupportCheckIn],
    [SITE_TYPES.WONG_GONGYI, wongFetchSupportCheckIn],
  ])(
    "uses the adapter-level support probe override for %s",
    async (siteType, supportProbe) => {
      supportProbe.mockResolvedValueOnce(true)

      const accountBootstrap = createNewApiAccountBootstrap(siteType)

      await expect(accountBootstrap.fetchCheckInSupport(request)).resolves.toBe(
        true,
      )

      expect(supportProbe).toHaveBeenCalledWith(request)
      expect(mockFetchCheckInSupport).not.toHaveBeenCalled()
    },
  )
})
