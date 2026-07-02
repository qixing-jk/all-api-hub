import { beforeEach, describe, expect, it, vi } from "vitest"

import { sharedChatAccountRefresh } from "~/services/apiAdapters/sharedchat/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const { mockFetchAccountData } = vi.hoisted(() => ({
  mockFetchAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/sharedchat", () => ({
  fetchAccountData: mockFetchAccountData,
}))

const refreshRequest = {
  baseUrl: "https://new.sharedchat.cc",
  accountId: "sharedchat-account",
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "sharedchat-user",
    accessToken: "user-token",
    cookie: "session=abc",
  },
  checkIn: {
    enableDetection: false,
  },
  includeTodayCashflow: true,
}

describe("sharedChatAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("refreshes account data through the SharedChat quota endpoint adapter", async () => {
    const accountData = {
      quota: 9800,
      today_prompt_tokens: 0,
      today_completion_tokens: 4000,
      today_quota_consumption: 12.5,
      today_requests_count: 8,
      today_income: 0,
      usage: {
        scope: "current_period",
        totalRequests: 8,
        totalTokens: 4000,
        totalCost: 12.5,
      },
      checkIn: {
        enableDetection: false,
      },
    }
    mockFetchAccountData.mockResolvedValueOnce(accountData)

    await expect(
      sharedChatAccountRefresh.refreshAccount(refreshRequest),
    ).resolves.toEqual({
      success: true,
      data: accountData,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "account:healthStatus.normal",
      },
    })

    expect(mockFetchAccountData).toHaveBeenCalledWith(refreshRequest)
  })

  it("returns a failed health result when the SharedChat quota fetch fails", async () => {
    mockFetchAccountData.mockRejectedValueOnce(new TypeError("failed to fetch"))

    await expect(
      sharedChatAccountRefresh.refreshAccount(refreshRequest),
    ).resolves.toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Error,
        message: "account:healthStatus.networkFailed",
      },
    })
  })
})
