import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createAccountBootstrapImplementation } from "~/services/apiService/newApiFamily/accountBootstrap"
import { AuthTypeEnum } from "~/types"

const {
  anyrouterFetchSupportCheckIn,
  commonExtractDefaultExchangeRate,
  commonFetchSiteStatus,
  commonFetchSupportCheckIn,
  commonFetchUserInfo,
  commonGetOrCreateAccessToken,
  wongFetchSupportCheckIn,
} = vi.hoisted(() => ({
  anyrouterFetchSupportCheckIn: vi.fn(),
  commonExtractDefaultExchangeRate: vi.fn(),
  commonFetchSiteStatus: vi.fn(),
  commonFetchSupportCheckIn: vi.fn(),
  commonFetchUserInfo: vi.fn(),
  commonGetOrCreateAccessToken: vi.fn(),
  wongFetchSupportCheckIn: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  extractDefaultExchangeRate: commonExtractDefaultExchangeRate,
  fetchSiteStatus: commonFetchSiteStatus,
  fetchSupportCheckIn: commonFetchSupportCheckIn,
  fetchUserInfo: commonFetchUserInfo,
  getOrCreateAccessToken: commonGetOrCreateAccessToken,
}))

vi.mock("~/services/apiService/anyrouter", () => ({
  fetchSupportCheckIn: anyrouterFetchSupportCheckIn,
}))

vi.mock("~/services/apiService/wong", () => ({
  fetchSupportCheckIn: wongFetchSupportCheckIn,
}))

describe("newApiFamily accountBootstrap", () => {
  const request = {
    baseUrl: "https://bootstrap.example.invalid",
    accountId: "account-1",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "user-1",
      accessToken: "access-token",
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses common-compatible bootstrap helpers by default for New API", async () => {
    const implementation = createAccountBootstrapImplementation(
      SITE_TYPES.NEW_API,
    )
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
    commonFetchUserInfo.mockResolvedValueOnce(userInfo)
    commonGetOrCreateAccessToken.mockResolvedValueOnce(accessToken)
    commonFetchSiteStatus.mockResolvedValueOnce(siteStatus)
    commonFetchSupportCheckIn.mockResolvedValueOnce(true)
    commonExtractDefaultExchangeRate.mockReturnValueOnce(7.2)

    await expect(implementation.fetchUserInfo(request)).resolves.toBe(userInfo)
    await expect(implementation.getOrCreateAccessToken(request)).resolves.toBe(
      accessToken,
    )
    await expect(implementation.fetchSiteStatus(request)).resolves.toBe(
      siteStatus,
    )
    await expect(implementation.fetchSupportCheckIn(request)).resolves.toBe(
      true,
    )
    expect(implementation.extractDefaultExchangeRate(siteStatus)).toBe(7.2)

    expect(commonFetchUserInfo).toHaveBeenCalledWith(request)
    expect(commonGetOrCreateAccessToken).toHaveBeenCalledWith(request)
    expect(commonFetchSiteStatus).toHaveBeenCalledWith(request)
    expect(commonFetchSupportCheckIn).toHaveBeenCalledWith(request)
    expect(commonExtractDefaultExchangeRate).toHaveBeenCalledWith(siteStatus)
  })

  it.each([
    [SITE_TYPES.ANYROUTER, anyrouterFetchSupportCheckIn],
    [SITE_TYPES.WONG_GONGYI, wongFetchSupportCheckIn],
  ])("uses the site-specific support probe for %s", async (siteType, probe) => {
    const implementation = createAccountBootstrapImplementation(siteType)
    probe.mockResolvedValueOnce(true)

    await expect(implementation.fetchSupportCheckIn(request)).resolves.toBe(
      true,
    )

    expect(probe).toHaveBeenCalledWith(request)
    expect(commonFetchSupportCheckIn).not.toHaveBeenCalled()
  })
})
