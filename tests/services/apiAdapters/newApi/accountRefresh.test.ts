import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiAccountRefresh } from "~/services/apiAdapters/newApi/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const { mockFetchSupportCheckIn, mockGetApiService, mockRefreshAccountData } =
  vi.hoisted(() => ({
    mockFetchSupportCheckIn: vi.fn(),
    mockGetApiService: vi.fn(),
    mockRefreshAccountData: vi.fn(),
  }))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
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
    mockGetApiService.mockReturnValue({
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      refreshAccountData: mockRefreshAccountData,
    })
  })

  it("delegates refresh operations through the site-specific apiService", async () => {
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
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)

    const accountRefresh = createNewApiAccountRefresh(SITE_TYPES.ONE_HUB)

    await expect(
      accountRefresh.fetchCheckInSupport?.(supportRequest),
    ).resolves.toBe(true)
    await expect(accountRefresh.refreshAccount(refreshRequest)).resolves.toBe(
      refreshResult,
    )

    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.ONE_HUB)
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(refreshRequest)
  })
})
