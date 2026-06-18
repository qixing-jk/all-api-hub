import { beforeEach, describe, expect, it, vi } from "vitest"

import { sub2ApiAccountRefresh } from "~/services/apiAdapters/sub2api/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const { mockFetchSupportCheckIn, mockRefreshAccountData } = vi.hoisted(() => ({
  mockFetchSupportCheckIn: vi.fn(),
  mockRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchSupportCheckIn: mockFetchSupportCheckIn,
  refreshAccountData: mockRefreshAccountData,
}))

const supportRequest = {
  baseUrl: "https://sub2.example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "dashboard-jwt",
    refreshToken: "refresh-token",
    tokenExpiresAt: 1999999999999,
  },
}

const refreshRequest = {
  ...supportRequest,
  accountId: "sub2-account",
  checkIn: {
    enableDetection: true,
    siteStatus: {
      isCheckedInToday: false,
    },
  },
  includeTodayCashflow: true,
}

describe("sub2ApiAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates refresh operations and preserves authUpdate fields", async () => {
    const refreshResult = {
      success: true,
      data: {
        quota: 42,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: {
          enableDetection: false,
        },
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "ok",
      },
      authUpdate: {
        accessToken: "new-dashboard-jwt",
        userId: "7",
        username: "alice",
        sub2apiAuth: {
          refreshToken: "new-refresh-token",
          tokenExpiresAt: 2000000000000,
        },
      },
    }
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)

    await expect(
      sub2ApiAccountRefresh.fetchCheckInSupport?.(supportRequest),
    ).resolves.toBe(false)
    await expect(
      sub2ApiAccountRefresh.refreshAccount(refreshRequest),
    ).resolves.toBe(refreshResult)

    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(refreshRequest)
  })
})
