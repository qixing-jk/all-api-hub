import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchAccountData as fetchAnyRouterAccountData } from "~/services/apiService/newApiFamily/variants/anyrouter"
import { fetchAccountData as fetchDoneHubAccountData } from "~/services/apiService/newApiFamily/variants/doneHub"
import { fetchAccountData as fetchVeloeraAccountData } from "~/services/apiService/newApiFamily/variants/veloera"
import { fetchAccountData as fetchWongAccountData } from "~/services/apiService/newApiFamily/variants/wong"
import { AuthTypeEnum } from "~/types"

const {
  mockFetchAccountQuota,
  mockFetchTodayIncome,
  mockFetchTodayUsage,
  mockGetTodayTimestampRange,
} = vi.hoisted(() => ({
  mockFetchAccountQuota: vi.fn(),
  mockFetchTodayIncome: vi.fn(),
  mockFetchTodayUsage: vi.fn(),
  mockGetTodayTimestampRange: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  fetchAccountQuota: mockFetchAccountQuota,
  fetchCheckInStatus: vi.fn(),
  fetchTodayIncome: mockFetchTodayIncome,
  fetchTodayUsage: mockFetchTodayUsage,
  resolveCheckInSiteStatus: vi.fn((checkIn) => checkIn.siteStatus ?? {}),
}))

vi.mock("~/services/apiService/newApiFamily/default/accountDataUtils", () => ({
  getTodayTimestampRange: mockGetTodayTimestampRange,
}))

const request = {
  baseUrl: "https://variant.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "access-token",
    userId: "user-1",
  },
  checkIn: { enableDetection: false },
}

const timestampRange = { start: 111, end: 222 }

describe("New API-family account-data variants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTodayTimestampRange.mockReturnValue(timestampRange)
    mockFetchAccountQuota.mockResolvedValue(100)
    mockFetchTodayUsage.mockResolvedValue({
      today_quota_consumption: 1,
      today_prompt_tokens: 2,
      today_completion_tokens: 3,
      today_requests_count: 4,
      todayStatsAvailability: {
        consumption: { status: "complete" },
        requests: { status: "complete" },
        tokens: { status: "complete" },
      },
    })
    mockFetchTodayIncome.mockResolvedValue({
      today_income: 5,
      todayStatsAvailability: { income: { status: "complete" } },
    })
  })

  it.each([
    ["AnyRouter", fetchAnyRouterAccountData],
    ["Veloera", fetchVeloeraAccountData],
    ["WONG", fetchWongAccountData],
  ])(
    "keeps the default query dialect and one frozen range for %s",
    async (_name, fetchData) => {
      const result = await fetchData(request)

      expect(mockGetTodayTimestampRange).toHaveBeenCalledTimes(1)
      expect(mockFetchTodayUsage).toHaveBeenCalledWith(
        request,
        undefined,
        timestampRange,
      )
      expect(mockFetchTodayIncome).toHaveBeenCalledWith(
        request,
        undefined,
        timestampRange,
      )
      expect(result.todayStatsAvailability).toEqual({
        consumption: { status: "complete" },
        requests: { status: "complete" },
        tokens: { status: "complete" },
        income: { status: "complete" },
      })
    },
  )

  it("preserves the DoneHub query dialect and one frozen range", async () => {
    const result = await fetchDoneHubAccountData(request)
    const doneHubConfig = {
      endpoint: "/api/log/self",
      pageParamName: "page",
      pageSizeParamName: "size",
      logTypeParamName: "log_type",
      itemsField: "data",
      totalField: "total_count",
      includeGroupParam: false,
    }

    expect(mockGetTodayTimestampRange).toHaveBeenCalledTimes(1)
    expect(mockFetchTodayUsage).toHaveBeenCalledWith(
      request,
      doneHubConfig,
      timestampRange,
    )
    expect(mockFetchTodayIncome).toHaveBeenCalledWith(
      request,
      doneHubConfig,
      timestampRange,
    )
    expect(result.todayStatsAvailability).toHaveProperty(
      "income.status",
      "complete",
    )
  })
})
