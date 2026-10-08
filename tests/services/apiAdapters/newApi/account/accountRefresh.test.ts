import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiAccountRefresh } from "~/services/apiAdapters/newApi/account/accountRefresh"
import { LAOZHANG_TODAY_LOG_QUERY_CONFIG } from "~/services/apiService/newApiFamily/variants/laozhang"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { createCheckInConfig } from "~~/tests/services/apiAdapters/checkInFixtures"

const {
  anyrouterFetchSupportCheckIn,
  anyrouterRefreshAccountData,
  mockFetchSupportCheckIn,
  mockRefreshAccountData,
  veloeraFetchSupportCheckIn,
  doneHubRefreshAccountData,
  veloeraRefreshAccountData,
  wongFetchSupportCheckIn,
  wongRefreshAccountData,
  rixRefreshAccountData,
} = vi.hoisted(() => ({
  anyrouterFetchSupportCheckIn: vi.fn(),
  anyrouterRefreshAccountData: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockRefreshAccountData: vi.fn(),
  veloeraFetchSupportCheckIn: vi.fn(),
  doneHubRefreshAccountData: vi.fn(),
  veloeraRefreshAccountData: vi.fn(),
  wongFetchSupportCheckIn: vi.fn(),
  wongRefreshAccountData: vi.fn(),
  rixRefreshAccountData: vi.fn(),
}))

vi.mock(
  "~/services/apiService/newApiFamily/default/accountRefresh",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/default/accountRefresh")
    >()),
    refreshAccountData: mockRefreshAccountData,
    defaultAccountRefreshImplementation: {
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      refreshAccountData: mockRefreshAccountData,
    },
  }),
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/anyrouter",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/anyrouter")
    >()),
    fetchSupportCheckIn: anyrouterFetchSupportCheckIn,
    refreshAccountData: anyrouterRefreshAccountData,
    fetchAccountData: vi.fn(),
  }),
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/doneHub",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/doneHub")
    >()),
    refreshAccountData: doneHubRefreshAccountData,
    fetchAccountData: vi.fn(),
  }),
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/veloera",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/veloera")
    >()),
    fetchSupportCheckIn: veloeraFetchSupportCheckIn,
    refreshAccountData: veloeraRefreshAccountData,
    fetchAccountData: vi.fn(),
  }),
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/wong",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/wong")
    >()),
    fetchSupportCheckIn: wongFetchSupportCheckIn,
    refreshAccountData: wongRefreshAccountData,
    fetchAccountData: vi.fn(),
  }),
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/rixApi",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/rixApi")
    >()),
    refreshAccountData: rixRefreshAccountData,
    fetchAccountData: vi.fn(),
  }),
)

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
  siteType: SITE_TYPES.NEW_API,
  checkIn: createCheckInConfig(SITE_TYPES.NEW_API, {
    isCheckedInToday: false,
  }),
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
  })

  it.each([
    [
      SITE_TYPES.ANYROUTER,
      anyrouterFetchSupportCheckIn,
      anyrouterRefreshAccountData,
    ],
    [SITE_TYPES.VELOERA, veloeraFetchSupportCheckIn, veloeraRefreshAccountData],
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
    [SITE_TYPES.RIX_API, rixRefreshAccountData],
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

  it("uses LaoZhang's log dialect without changing the default support probe", async () => {
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)
    const capability = createNewApiAccountRefresh(SITE_TYPES.LAOZHANG)

    await expect(
      capability.fetchCheckInSupport?.(supportRequest),
    ).resolves.toBe(false)
    await expect(capability.refreshAccount(refreshRequest)).resolves.toBe(
      refreshResult,
    )
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(
      refreshRequest,
      LAOZHANG_TODAY_LOG_QUERY_CONFIG,
    )
  })
})
