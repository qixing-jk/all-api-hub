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
import { fetchTodayUsage as fetchDoneHubTodayUsage } from "~/services/apiService/newApiFamily/variants/doneHub"
import { ApiError } from "~/services/apiTransport/errors"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
} from "~/types"

const {
  mockAggregateIncomeData,
  mockAggregateUsageData,
  mockExtractAmount,
  mockFetchApiData,
  mockGetTodayTimestampRange,
} = vi.hoisted(() => ({
  mockAggregateIncomeData: vi.fn(),
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
  aggregateIncomeData: mockAggregateIncomeData,
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

const complete = { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete } as const
const unavailable = (reason: string) => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason,
})
const partial = (reason: string) => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
  reason,
})

describe("newApiFamily accountData", () => {
  beforeEach(() => {
    mockAggregateIncomeData.mockReset()
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
    mockAggregateUsageData.mockImplementation((items: any[], initial?: any) => {
      const result = structuredClone(
        initial ?? {
          today_quota_consumption: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          coverage: {
            rows: { validCount: 0, invalidCount: 0 },
            consumption: { validCount: 0, invalidCount: 0 },
            promptTokens: { validCount: 0, invalidCount: 0 },
            completionTokens: { validCount: 0, invalidCount: 0 },
          },
        },
      )
      for (const item of items) {
        result.coverage.rows.validCount += 1
        for (const [field, total, coverage] of [
          ["quota", "today_quota_consumption", "consumption"],
          ["prompt_tokens", "today_prompt_tokens", "promptTokens"],
          ["completion_tokens", "today_completion_tokens", "completionTokens"],
        ]) {
          const value = item[field]
          if (typeof value === "number" && Number.isFinite(value)) {
            result[total] += value
            result.coverage[coverage].validCount += 1
          } else {
            result.coverage[coverage].invalidCount += 1
          }
        }
      }
      return result
    })
    mockAggregateIncomeData.mockImplementation(
      (
        items: any[],
        exchangeRate: number,
        conversionFactor: number,
        initial?: any,
      ) => {
        const result = structuredClone(
          initial ?? {
            today_income: 0,
            coverage: { validCount: 0, invalidCount: 0 },
          },
        )
        for (const item of items) {
          const value = Object.hasOwn(item, "quota")
            ? item.quota
            : conversionFactor *
              (mockExtractAmount(item.content, exchangeRate)?.amount ??
                Number.NaN)
          if (typeof value === "number" && Number.isFinite(value)) {
            result.today_income += value
            result.coverage.validCount += 1
          } else {
            result.coverage.invalidCount += 1
          }
        }
        return result
      },
    )
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
      todayStatsAvailability: {
        consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
        requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
        tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
      },
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
      todayStatsAvailability: {
        consumption: complete,
        requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
        tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      },
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

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "fetchTodayUsage falls back when stat quota is not finite (%s)",
    async (quota) => {
      mockFetchApiData
        .mockResolvedValueOnce({ quota })
        .mockResolvedValueOnce({ items: [], total: 0 })

      await expect(fetchTodayUsage(baseRequest)).resolves.toEqual({
        today_quota_consumption: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_requests_count: 0,
        todayStatsAvailability: {
          consumption: complete,
          requests: complete,
          tokens: complete,
        },
      })
    },
  )

  it("classifies a full-log failure before any covered page as unavailable", async () => {
    mockFetchApiData
      .mockRejectedValueOnce(new Error("stat unavailable"))
      .mockRejectedValueOnce(new Error("logs unavailable"))

    await expect(fetchTodayUsage(baseRequest)).resolves.toMatchObject({
      today_quota_consumption: 0,
      today_requests_count: 0,
      todayStatsAvailability: {
        consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.RequestFailed),
        requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.RequestFailed),
        tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.RequestFailed),
      },
    })
  })

  it("classifies a full-log failure after a covered page as partial", async () => {
    mockFetchApiData
      .mockRejectedValueOnce(new Error("stat unavailable"))
      .mockResolvedValueOnce({
        items: [{ quota: 10, prompt_tokens: 2, completion_tokens: 3 }],
        total: 3,
      })
      .mockRejectedValueOnce(new Error("page unavailable"))

    await expect(fetchTodayUsage(baseRequest)).resolves.toMatchObject({
      today_quota_consumption: 10,
      today_requests_count: 1,
      todayStatsAvailability: {
        consumption: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
        requests: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
        tokens: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
      },
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
    ).resolves.toMatchObject({
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

    await expect(fetchTodayUsage(baseRequest)).resolves.toMatchObject({
      today_quota_consumption: 30,
      today_prompt_tokens: 6,
      today_completion_tokens: 8,
      today_requests_count: 2,
      todayStatsAvailability: {
        consumption: partial(ACCOUNT_TODAY_METRIC_REASONS.PageLimit),
        requests: partial(ACCOUNT_TODAY_METRIC_REASONS.PageLimit),
        tokens: partial(ACCOUNT_TODAY_METRIC_REASONS.PageLimit),
      },
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

  it.each([
    ["missing items", { total: 0 }],
    ["null items", { items: null, total: 0 }],
    ["non-array items", { items: "not-an-array", total: 0 }],
    ["missing total", { items: [] }],
    ["null total", { items: [], total: null }],
    ["non-numeric total", { items: [], total: "0" }],
    ["NaN total", { items: [], total: Number.NaN }],
    ["infinite total", { items: [], total: Number.POSITIVE_INFINITY }],
    ["negative total", { items: [], total: -1 }],
  ])(
    "fetchTodayUsage rejects a default log payload with %s",
    async (_label, payload) => {
      mockFetchApiData.mockImplementation(async (_request, { endpoint }) => {
        if (endpoint.startsWith("/api/log/self/stat?")) {
          throw new Error("stat unavailable")
        }
        return payload
      })

      await expect(fetchTodayUsage(baseRequest)).resolves.toMatchObject({
        today_quota_consumption: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_requests_count: 0,
        todayStatsAvailability: {
          consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload),
          requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload),
          tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload),
        },
      })
    },
  )

  it.each([
    ["malformed data", { data: null, total_count: 0 }],
    ["malformed total_count", { data: [], total_count: "0" }],
  ])(
    "fetchTodayUsage rejects a DoneHub log payload with %s",
    async (_label, payload) => {
      mockFetchApiData.mockImplementation(async (_request, { endpoint }) => {
        if (endpoint.startsWith("/api/log/self/stat?")) {
          throw new Error("stat unavailable")
        }
        return payload
      })

      await expect(fetchDoneHubTodayUsage(baseRequest)).resolves.toMatchObject({
        today_quota_consumption: 0,
        today_requests_count: 0,
        todayStatsAvailability: {
          consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload),
          requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload),
          tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload),
        },
      })
    },
  )

  it("classifies malformed pagination after a covered page as partial", async () => {
    mockFetchApiData.mockImplementation(async (_request, { endpoint }) => {
      if (endpoint.startsWith("/api/log/self/stat?")) {
        throw new Error("stat unavailable")
      }

      const page = new URL(
        endpoint,
        "https://example.invalid",
      ).searchParams.get("p")
      return page === "1"
        ? {
            items: [{ quota: 10, prompt_tokens: 2, completion_tokens: 3 }],
            total: 3,
          }
        : { items: null, total: 3 }
    })

    await expect(fetchTodayUsage(baseRequest)).resolves.toMatchObject({
      today_quota_consumption: 10,
      today_prompt_tokens: 2,
      today_completion_tokens: 3,
      today_requests_count: 1,
      todayStatsAvailability: {
        consumption: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
        requests: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
        tokens: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
      },
    })
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
    ).resolves.toMatchObject({
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
    ).resolves.toEqual({
      today_income: 0,
      todayStatsAvailability: {
        income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
      },
    })
  })

  it("classifies income as partial when exactly one source is covered", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockRejectedValueOnce(new Error("system logs unavailable"))

    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 0,
      todayStatsAvailability: {
        income: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
      },
    })
  })

  it("classifies one covered income source plus one malformed source as partial", async () => {
    mockFetchApiData.mockImplementation(async (_request, { endpoint }) => {
      const logType = new URL(
        endpoint,
        "https://example.invalid",
      ).searchParams.get("type")
      return logType === String(LogType.Topup)
        ? { items: [{ quota: 10 }], total: 1 }
        : { items: null, total: 0 }
    })

    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 10,
      todayStatsAvailability: {
        income: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
      },
    })
  })

  it("classifies income as unavailable when neither source is covered", async () => {
    mockFetchApiData
      .mockRejectedValueOnce(new Error("topup logs unavailable"))
      .mockRejectedValueOnce(new Error("system logs unavailable"))

    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 0,
      todayStatsAvailability: {
        income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.RequestFailed),
      },
    })
  })

  it("freezes one timestamp range for the whole account snapshot", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-17T23:59:59.900"))
    mockFetchApiData.mockImplementation(async (_request, { endpoint }) => {
      if (endpoint === "/api/user/self") return { quota: 1 }
      if (endpoint.startsWith("/api/log/self/stat?")) {
        vi.setSystemTime(new Date("2026-07-18T00:00:00.100"))
        throw new Error("stat unavailable")
      }
      if (endpoint.startsWith("/api/log/self?")) {
        const params = new URL(endpoint, "https://example.invalid").searchParams
        const isConsume = params.get("type") === String(LogType.Consume)
        const page = Number(params.get("p"))
        return {
          items: [],
          total: isConsume && page === 1 ? 3 : 0,
        }
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`)
    })

    await fetchAccountData({
      ...baseRequest,
      checkIn: { enableDetection: false },
    })

    expect(mockGetTodayTimestampRange).toHaveBeenCalledTimes(1)
    const todayEndpoints = mockFetchApiData.mock.calls
      .map(([, options]) => options.endpoint as string)
      .filter((endpoint) => endpoint.includes("start_timestamp"))
    expect(todayEndpoints).toHaveLength(5)
    expect(todayEndpoints.every((endpoint) => endpoint.includes("111"))).toBe(
      true,
    )
    expect(todayEndpoints.every((endpoint) => endpoint.includes("222"))).toBe(
      true,
    )
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
    ).resolves.toMatchObject({
      today_income: 375,
      todayStatsAvailability: { income: complete },
    })

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

    await expect(fetchTodayIncome(baseRequest)).resolves.toMatchObject({
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

    await expect(fetchTodayIncome(baseRequest)).resolves.toMatchObject({
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
    ).resolves.toMatchObject({
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
