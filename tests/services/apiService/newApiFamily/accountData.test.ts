import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  defaultAccountDataImplementation,
  fetchAccountData,
  fetchAccountQuota,
  fetchCheckInStatus,
  fetchTodayIncome,
  fetchTodayUsage,
  resolveCheckInSiteStatus,
} from "~/services/apiService/newApiFamily/default/accountData"
import { ApiError } from "~/services/apiTransport/errors"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import { AuthTypeEnum } from "~/types"

const {
  mockAggregateUsageData,
  mockExtractAmount,
  mockFetchApiData,
  mockGetTodayTimestampRange,
} = vi.hoisted(() => ({
  mockAggregateUsageData: vi.fn(),
  mockExtractAmount: vi.fn(),
  mockFetchApiData: vi.fn(),
  mockGetTodayTimestampRange: vi.fn(),
}))

const { mockLoggerDebug, mockLoggerError, mockLoggerInfo, mockLoggerWarn } =
  vi.hoisted(() => ({
    mockLoggerDebug: vi.fn(),
    mockLoggerError: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerWarn: vi.fn(),
  }))

vi.mock("~/constants/ui", () => ({
  UI_CONSTANTS: {
    EXCHANGE_RATE: {
      DEFAULT: 7,
      CONVERSION_FACTOR: 100,
    },
  },
}))

vi.mock("~/services/apiTransport/constant", () => ({
  REQUEST_CONFIG: {
    DEFAULT_PAGE_SIZE: 2,
    MAX_PAGES: 2,
  },
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: mockFetchApiData,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountDataUtils", () => ({
  aggregateUsageData: mockAggregateUsageData,
  extractAmount: mockExtractAmount,
  getTodayTimestampRange: mockGetTodayTimestampRange,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    debug: mockLoggerDebug,
    error: mockLoggerError,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  })),
}))

const baseRequest = {
  baseUrl: "https://data.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
  checkIn: {
    enableDetection: true,
    autoCheckInEnabled: true,
    siteStatus: {
      isCheckedInToday: false,
    },
  },
}

describe("newApiFamily accountData", () => {
  beforeEach(() => {
    mockAggregateUsageData.mockReset()
    mockExtractAmount.mockReset()
    mockFetchApiData.mockReset()
    mockGetTodayTimestampRange.mockReset()
    mockLoggerDebug.mockReset()
    mockLoggerError.mockReset()
    mockLoggerInfo.mockReset()
    mockLoggerWarn.mockReset()
    vi.useRealTimers()

    mockGetTodayTimestampRange.mockReturnValue({
      start: 111,
      end: 222,
    })
    mockAggregateUsageData.mockImplementation((items: any[]) => ({
      today_quota_consumption: items.reduce(
        (sum, item) => sum + (item.quota ?? 0),
        0,
      ),
      today_prompt_tokens: items.reduce(
        (sum, item) => sum + (item.prompt_tokens ?? 0),
        0,
      ),
      today_completion_tokens: items.reduce(
        (sum, item) => sum + (item.completion_tokens ?? 0),
        0,
      ),
      today_requests_count: items.length,
    }))
    mockExtractAmount.mockReturnValue({ amount: 0 })
  })

  it("fetchAccountQuota falls back to zero when quota is missing", async () => {
    mockFetchApiData.mockResolvedValueOnce({})

    await expect(fetchAccountQuota(baseRequest)).resolves.toBe(0)
  })

  it("fetchCheckInStatus returns whether the user can still check in today", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      stats: {
        checked_in_today: false,
      },
    })

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBe(true)
  })

  it.each([404, 500])(
    "fetchCheckInStatus treats ApiError %i as unsupported",
    async (statusCode) => {
      mockFetchApiData.mockRejectedValueOnce(
        new ApiError("unsupported", statusCode),
      )

      await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
    },
  )

  it("fetchCheckInStatus also hides unexpected failures", async () => {
    mockFetchApiData.mockRejectedValueOnce(new Error("boom"))

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
  })

  it("fetchTodayUsage short-circuits when cashflow collection is disabled", async () => {
    await expect(
      fetchTodayUsage({
        ...baseRequest,
        includeTodayCashflow: false,
      }),
    ).resolves.toEqual({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
    })
    expect(mockFetchApiData).not.toHaveBeenCalled()
  })

  it("fetchTodayUsage uses only the stat endpoint on the fast path", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      quota: 60,
    })

    await expect(fetchTodayUsage(baseRequest)).resolves.toEqual({
      today_quota_consumption: 60,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
    })

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    expect(mockFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: `/api/log/self/stat?${new URLSearchParams({
        p: "1",
        page_size: "2",
        token_name: "",
        model_name: "",
        start_timestamp: "111",
        end_timestamp: "222",
        type: String(LogType.Consume),
        group: "",
      }).toString()}`,
    })
  })

  it("fetchTodayUsage treats non-numeric stat quota as zero", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      quota: "not-a-number",
    })

    await expect(fetchTodayUsage(baseRequest)).resolves.toEqual({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
    })
  })

  it("fetchTodayUsage supports overridden log query params on the fast path", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      quota: 60,
    })

    await expect(
      fetchTodayUsage(baseRequest, {
        endpoint: "/api/log/self",
        pageParamName: "page",
        pageSizeParamName: "size",
        logTypeParamName: "log_type",
        itemsField: "data",
        totalField: "total_count",
        includeGroupParam: false,
      }),
    ).resolves.toEqual({
      today_quota_consumption: 60,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
    })

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    expect(mockFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: `/api/log/self/stat?${new URLSearchParams({
        page: "1",
        size: "2",
        token_name: "",
        model_name: "",
        start_timestamp: "111",
        end_timestamp: "222",
        log_type: String(LogType.Consume),
      }).toString()}`,
    })
  })

  it("fetchTodayUsage falls back to full log aggregation when the fast path fails", async () => {
    mockFetchApiData
      .mockRejectedValueOnce(new Error("stat unavailable"))
      .mockResolvedValueOnce({
        items: [{ quota: 10, prompt_tokens: 2, completion_tokens: 3 }],
        total: 99,
      })
      .mockResolvedValueOnce({
        items: [{ quota: 20, prompt_tokens: 4, completion_tokens: 5 }],
        total: 99,
      })

    await expect(fetchTodayUsage(baseRequest)).resolves.toEqual({
      today_quota_consumption: 30,
      today_prompt_tokens: 6,
      today_completion_tokens: 8,
      today_requests_count: 2,
    })

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "今日消费快路径失败，回退到日志聚合",
      expect.any(Error),
    )
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "达到最大分页限制，数据可能不完整",
      {
        maxPages: 2,
      },
    )
  })

  it("fetchTodayUsage treats invalid log totals as a single page", async () => {
    mockFetchApiData
      .mockRejectedValueOnce(new Error("stat unavailable"))
      .mockResolvedValueOnce({
        items: [{ quota: 10, prompt_tokens: 2, completion_tokens: 3 }],
        total: Number.NaN,
      })

    await expect(fetchTodayUsage(baseRequest)).resolves.toEqual({
      today_quota_consumption: 10,
      today_prompt_tokens: 2,
      today_completion_tokens: 3,
      today_requests_count: 1,
    })
    expect(mockFetchApiData).toHaveBeenCalledTimes(2)
  })

  it("fetchTodayUsage aggregates legacy array log responses with extra query params", async () => {
    mockFetchApiData
      .mockRejectedValueOnce(new Error("stat unavailable"))
      .mockResolvedValueOnce([
        { quota: 10, prompt_tokens: 2, completion_tokens: 3 },
      ])

    await expect(
      fetchTodayUsage(baseRequest, {
        extraParams: {
          source: "admin",
        },
      }),
    ).resolves.toEqual({
      today_quota_consumption: 10,
      today_prompt_tokens: 2,
      today_completion_tokens: 3,
      today_requests_count: 1,
    })

    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, baseRequest, {
      endpoint: `/api/log/self?${new URLSearchParams({
        p: "1",
        page_size: "2",
        token_name: "",
        model_name: "",
        start_timestamp: "111",
        end_timestamp: "222",
        type: String(LogType.Consume),
        group: "",
        source: "admin",
      }).toString()}`,
    })
  })

  it("fetchTodayIncome short-circuits when cashflow collection is disabled", async () => {
    await expect(
      fetchTodayIncome({
        ...baseRequest,
        includeTodayCashflow: false,
      }),
    ).resolves.toEqual({ today_income: 0 })
  })

  it("fetchTodayIncome uses the request exchange rate and parses quota fallbacks", async () => {
    mockExtractAmount.mockReturnValueOnce({ amount: 3 })
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ quota: 50 }, { content: "recharge 3 USD" }],
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [{ quota: 25 }],
        total: 1,
      })

    await expect(
      fetchTodayIncome({
        ...baseRequest,
        exchangeRate: 9,
      }),
    ).resolves.toEqual({ today_income: 375 })

    expect(mockExtractAmount).toHaveBeenCalledWith("recharge 3 USD", 9)
  })

  it("fetchTodayIncome uses the default exchange rate when the request has no exchange rate", async () => {
    mockExtractAmount.mockReturnValueOnce({ amount: 2 })
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ content: "recharge 2 USD" }],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })

    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 200,
    })
    expect(mockExtractAmount).toHaveBeenCalledWith("recharge 2 USD", 7)
  })

  it("fetchTodayIncome treats unparsable income log content as zero", async () => {
    mockExtractAmount.mockReturnValueOnce(null)
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ content: "unparsed income" }],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })

    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 0,
    })
  })

  it("fetchTodayIncome supports overridden log query params and response fields", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        data: [{ quota: 20 }],
        total_count: 1,
      })
      .mockResolvedValueOnce({
        data: [{ quota: 30 }],
        total_count: 1,
      })

    await expect(
      fetchTodayIncome(baseRequest, {
        endpoint: "/api/log/self",
        pageParamName: "page",
        pageSizeParamName: "size",
        logTypeParamName: "log_type",
        itemsField: "data",
        totalField: "total_count",
        includeGroupParam: false,
      }),
    ).resolves.toEqual({
      today_income: 50,
    })

    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, baseRequest, {
      endpoint: `/api/log/self?${new URLSearchParams({
        page: "1",
        size: "2",
        token_name: "",
        model_name: "",
        start_timestamp: "111",
        end_timestamp: "222",
        log_type: String(LogType.Topup),
      }).toString()}`,
    })

    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, baseRequest, {
      endpoint: `/api/log/self?${new URLSearchParams({
        page: "1",
        size: "2",
        token_name: "",
        model_name: "",
        start_timestamp: "111",
        end_timestamp: "222",
        log_type: String(LogType.System),
      }).toString()}`,
    })
  })

  it("fetchAccountData preserves existing siteStatus when detection is disabled", async () => {
    mockFetchApiData.mockResolvedValueOnce({ quota: 321 })

    const implementation = defaultAccountDataImplementation

    const result = await implementation.fetchAccountData({
      ...baseRequest,
      includeTodayCashflow: false,
      checkIn: {
        enableDetection: false,
        siteStatus: {
          isCheckedInToday: true,
          lastDetectedAt: 1234,
        },
      },
    })

    expect(result).toMatchObject({
      quota: 321,
      today_income: 0,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      checkIn: {
        enableDetection: false,
        siteStatus: {
          isCheckedInToday: true,
          lastDetectedAt: 1234,
        },
      },
    })
  })

  it("fetchAccountData maps detection results into siteStatus and timestamps", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-28T12:00:00.000Z"))
    mockFetchApiData.mockImplementation((_request, { endpoint }) => {
      if (endpoint === "/api/user/self") {
        return Promise.resolve({ quota: 99 })
      }

      if (String(endpoint).startsWith("/api/log/self/stat?")) {
        return Promise.resolve({ quota: 3 })
      }

      if (String(endpoint).startsWith("/api/log/self?")) {
        return Promise.resolve({
          items: [],
          total: 0,
        })
      }

      if (String(endpoint).startsWith("/api/user/checkin?")) {
        return Promise.resolve({
          stats: {
            checked_in_today: false,
          },
        })
      }

      return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`))
    })
    const result = await fetchAccountData({
      ...baseRequest,
      checkIn: {
        enableDetection: true,
        siteStatus: {},
      },
    })

    expect(result.checkIn.siteStatus).toEqual({
      isCheckedInToday: false,
      lastDetectedAt: Date.parse("2026-03-28T12:00:00.000Z"),
    })
    vi.useRealTimers()
  })

  it("resolveCheckInSiteStatus preserves the previous status after inconclusive detection", () => {
    expect(
      resolveCheckInSiteStatus(
        {
          enableDetection: true,
          siteStatus: {
            isCheckedInToday: true,
            lastDetectedAt: 1234,
          },
        },
        undefined,
      ),
    ).toEqual({
      isCheckedInToday: true,
      lastDetectedAt: 1234,
    })
  })
})
