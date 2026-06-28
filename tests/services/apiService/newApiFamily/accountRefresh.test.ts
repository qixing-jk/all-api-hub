import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createAccountRefreshImplementation } from "~/services/apiService/newApiFamily/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const {
  anyrouterFetchSupportCheckIn,
  anyrouterRefreshAccountData,
  commonFetchSupportCheckIn,
  commonRefreshAccountData,
  doneHubRefreshAccountData,
  veloeraRefreshAccountData,
  wongFetchSupportCheckIn,
  wongRefreshAccountData,
} = vi.hoisted(() => ({
  anyrouterFetchSupportCheckIn: vi.fn(),
  anyrouterRefreshAccountData: vi.fn(),
  commonFetchSupportCheckIn: vi.fn(),
  commonRefreshAccountData: vi.fn(),
  doneHubRefreshAccountData: vi.fn(),
  veloeraRefreshAccountData: vi.fn(),
  wongFetchSupportCheckIn: vi.fn(),
  wongRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchSupportCheckIn: commonFetchSupportCheckIn,
  refreshAccountData: commonRefreshAccountData,
}))

vi.mock("~/services/apiService/anyrouter", () => ({
  fetchSupportCheckIn: anyrouterFetchSupportCheckIn,
  refreshAccountData: anyrouterRefreshAccountData,
}))

vi.mock("~/services/apiService/doneHub", () => ({
  refreshAccountData: doneHubRefreshAccountData,
}))

vi.mock("~/services/apiService/veloera", () => ({
  refreshAccountData: veloeraRefreshAccountData,
}))

vi.mock("~/services/apiService/wong", () => ({
  fetchSupportCheckIn: wongFetchSupportCheckIn,
  refreshAccountData: wongRefreshAccountData,
}))

describe("newApiFamily accountRefresh", () => {
  const supportRequest = {
    baseUrl: "https://refresh.example.invalid",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: "account-token",
    },
  }

  const refreshRequest = {
    ...supportRequest,
    accountId: "account-1",
    checkIn: {
      enableDetection: true,
      autoCheckInEnabled: true,
      siteStatus: {
        isCheckedInToday: false,
      },
    },
    includeTodayCashflow: false,
  }

  const refreshResult = {
    success: true,
    data: {
      quota: 123,
      today_prompt_tokens: 1,
      today_completion_tokens: 2,
      today_quota_consumption: 3,
      today_requests_count: 4,
      today_income: 5,
      checkIn: refreshRequest.checkIn,
    },
    healthStatus: {
      status: SiteHealthStatus.Healthy,
      message: "ok",
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses common-compatible refresh helpers by default for New API", async () => {
    commonFetchSupportCheckIn.mockResolvedValueOnce(true)
    commonRefreshAccountData.mockResolvedValueOnce(refreshResult)

    const implementation = createAccountRefreshImplementation(
      SITE_TYPES.NEW_API,
    )

    await expect(
      implementation.fetchSupportCheckIn(supportRequest),
    ).resolves.toBe(true)
    await expect(
      implementation.refreshAccountData(refreshRequest),
    ).resolves.toBe(refreshResult)

    expect(commonFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(commonRefreshAccountData).toHaveBeenCalledWith(refreshRequest)
  })

  it.each([
    [
      SITE_TYPES.ANYROUTER,
      anyrouterFetchSupportCheckIn,
      anyrouterRefreshAccountData,
    ],
    [SITE_TYPES.WONG_GONGYI, wongFetchSupportCheckIn, wongRefreshAccountData],
  ])(
    "uses site-specific support and refresh helpers for %s",
    async (siteType, supportProbe, refreshLoader) => {
      supportProbe.mockResolvedValueOnce(true)
      refreshLoader.mockResolvedValueOnce(refreshResult)

      const implementation = createAccountRefreshImplementation(siteType)

      await expect(
        implementation.fetchSupportCheckIn(supportRequest),
      ).resolves.toBe(true)
      await expect(
        implementation.refreshAccountData(refreshRequest),
      ).resolves.toBe(refreshResult)

      expect(supportProbe).toHaveBeenCalledWith(supportRequest)
      expect(refreshLoader).toHaveBeenCalledWith(refreshRequest)
      expect(commonFetchSupportCheckIn).not.toHaveBeenCalled()
      expect(commonRefreshAccountData).not.toHaveBeenCalled()
    },
  )

  it.each([
    [SITE_TYPES.DONE_HUB, doneHubRefreshAccountData],
    [SITE_TYPES.VELOERA, veloeraRefreshAccountData],
  ])(
    "uses common support probing and site-specific refresh for %s",
    async (siteType, refreshLoader) => {
      commonFetchSupportCheckIn.mockResolvedValueOnce(true)
      refreshLoader.mockResolvedValueOnce(refreshResult)

      const implementation = createAccountRefreshImplementation(siteType)

      await expect(
        implementation.fetchSupportCheckIn(supportRequest),
      ).resolves.toBe(true)
      await expect(
        implementation.refreshAccountData(refreshRequest),
      ).resolves.toBe(refreshResult)

      expect(commonFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
      expect(refreshLoader).toHaveBeenCalledWith(refreshRequest)
      expect(commonRefreshAccountData).not.toHaveBeenCalled()
    },
  )
})
