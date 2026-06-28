import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiAccountRefresh } from "~/services/apiAdapters/newApi/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const {
  anyrouterFetchSupportCheckIn,
  anyrouterRefreshAccountData,
  mockFetchSupportCheckIn,
  mockGetApiService,
  mockRefreshAccountData,
  doneHubRefreshAccountData,
  veloeraRefreshAccountData,
  wongFetchSupportCheckIn,
  wongRefreshAccountData,
} = vi.hoisted(() => ({
  anyrouterFetchSupportCheckIn: vi.fn(),
  anyrouterRefreshAccountData: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockGetApiService: vi.fn(() => {
    throw new Error("legacy apiService facade should not be used")
  }),
  mockRefreshAccountData: vi.fn(),
  doneHubRefreshAccountData: vi.fn(),
  veloeraRefreshAccountData: vi.fn(),
  wongFetchSupportCheckIn: vi.fn(),
  wongRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/accountRefresh", () => ({
  defaultAccountRefreshImplementation: {
    fetchSupportCheckIn: mockFetchSupportCheckIn,
    refreshAccountData: mockRefreshAccountData,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/newApiFamily/variants/anyrouter", () => ({
  fetchSupportCheckIn: anyrouterFetchSupportCheckIn,
  refreshAccountData: anyrouterRefreshAccountData,
}))

vi.mock("~/services/apiService/newApiFamily/variants/doneHub", () => ({
  refreshAccountData: doneHubRefreshAccountData,
}))

vi.mock("~/services/apiService/newApiFamily/variants/veloera", () => ({
  refreshAccountData: veloeraRefreshAccountData,
}))

vi.mock("~/services/apiService/newApiFamily/variants/wong", () => ({
  fetchSupportCheckIn: wongFetchSupportCheckIn,
  refreshAccountData: wongRefreshAccountData,
}))

const supportRequest = {
  baseUrl: "https://one.example.invalid",
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

describe("createNewApiAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it("delegates refresh operations through the default New API-family implementation", async () => {
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)

    const accountRefresh = createNewApiAccountRefresh(SITE_TYPES.NEW_API)

    await expect(
      accountRefresh.fetchCheckInSupport?.(supportRequest),
    ).resolves.toBe(true)
    await expect(accountRefresh.refreshAccount(refreshRequest)).resolves.toBe(
      refreshResult,
    )

    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(refreshRequest)
    expect(mockGetApiService).not.toHaveBeenCalled()
  })

  it.each([
    [
      SITE_TYPES.ANYROUTER,
      anyrouterFetchSupportCheckIn,
      anyrouterRefreshAccountData,
    ],
    [SITE_TYPES.WONG_GONGYI, wongFetchSupportCheckIn, wongRefreshAccountData],
  ])(
    "uses adapter-level support and refresh overrides for %s",
    async (siteType, supportProbe, refreshLoader) => {
      supportProbe.mockResolvedValueOnce(true)
      refreshLoader.mockResolvedValueOnce(refreshResult)

      const accountRefresh = createNewApiAccountRefresh(siteType)

      await expect(
        accountRefresh.fetchCheckInSupport?.(supportRequest),
      ).resolves.toBe(true)
      await expect(accountRefresh.refreshAccount(refreshRequest)).resolves.toBe(
        refreshResult,
      )

      expect(supportProbe).toHaveBeenCalledWith(supportRequest)
      expect(refreshLoader).toHaveBeenCalledWith(refreshRequest)
      expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
      expect(mockRefreshAccountData).not.toHaveBeenCalled()
    },
  )

  it.each([
    [SITE_TYPES.DONE_HUB, doneHubRefreshAccountData],
    [SITE_TYPES.VELOERA, veloeraRefreshAccountData],
  ])(
    "keeps default support probing while using adapter-level refresh override for %s",
    async (siteType, refreshLoader) => {
      mockFetchSupportCheckIn.mockResolvedValueOnce(true)
      refreshLoader.mockResolvedValueOnce(refreshResult)

      const accountRefresh = createNewApiAccountRefresh(siteType)

      await expect(
        accountRefresh.fetchCheckInSupport?.(supportRequest),
      ).resolves.toBe(true)
      await expect(accountRefresh.refreshAccount(refreshRequest)).resolves.toBe(
        refreshResult,
      )

      expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
      expect(refreshLoader).toHaveBeenCalledWith(refreshRequest)
      expect(mockRefreshAccountData).not.toHaveBeenCalled()
    },
  )
})
