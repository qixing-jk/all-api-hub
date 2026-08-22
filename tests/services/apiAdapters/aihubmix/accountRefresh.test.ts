import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixAccountRefresh } from "~/services/apiAdapters/aihubmix/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

import { createCheckInConfig } from "../checkInFixtures"

const { mockFetchSupportCheckIn, mockRefreshAccountData } = vi.hoisted(() => ({
  mockFetchSupportCheckIn: vi.fn(),
  mockRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchSupportCheckIn: mockFetchSupportCheckIn,
  refreshAccountData: mockRefreshAccountData,
}))

const supportRequest = {
  baseUrl: "https://aihubmix.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "aihubmix-access-token",
  },
}

const refreshRequest = {
  ...supportRequest,
  accountId: "aihubmix-account",
  siteType: SITE_TYPES.AIHUBMIX,
  checkIn: createCheckInConfig(SITE_TYPES.AIHUBMIX, { matched: false }),
  includeTodayCashflow: true,
}

describe("aihubmixAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates refresh operations without reshaping disabled check-in or zeroed stats", async () => {
    const refreshResult = {
      success: true,
      data: {
        quota: 9800,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: createCheckInConfig(SITE_TYPES.AIHUBMIX, {
          matched: false,
        }),
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "ok",
      },
    }
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)

    await expect(
      aihubmixAccountRefresh.fetchCheckInSupport?.(supportRequest),
    ).resolves.toBe(false)
    await expect(
      aihubmixAccountRefresh.refreshAccount(refreshRequest),
    ).resolves.toBe(refreshResult)

    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(refreshRequest)
  })
})
