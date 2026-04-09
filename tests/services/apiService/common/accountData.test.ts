import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAccessToken,
  createApiToken,
  createChannel,
  deleteApiToken,
  deleteChannel,
  determineHealthStatus,
  extractDefaultExchangeRate,
  fetchAccountAvailableModels,
  fetchAccountData,
  fetchAccountQuota,
  fetchAccountTokens,
  fetchCheckInStatus,
  fetchModelPricing,
  fetchPaymentInfo,
  fetchSiteStatus,
  fetchSiteUserGroups,
  fetchSupportCheckIn,
  fetchTodayIncome,
  fetchTodayUsage,
  fetchTokenById,
  fetchUserGroups,
  fetchUserInfo,
  getOrCreateAccessToken,
  redeemCode,
  refreshAccountData,
  searchChannel,
  updateApiToken,
  updateChannel,
  updateChannelModelMapping,
  updateChannelModels,
  validateAccountConnection,
} from "~/services/apiService/common"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import { LogType } from "~/services/apiService/common/type"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
} from "~/types"

const {
  mockFetchApi,
  mockFetchApiData,
  mockAggregateUsageData,
  mockExtractAmount,
  mockGetTodayTimestampRange,
} = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
  mockFetchApiData: vi.fn(),
  mockAggregateUsageData: vi.fn(),
  mockExtractAmount: vi.fn(),
  mockGetTodayTimestampRange: vi.fn(),
}))

const {
  mockGetAccountById,
  mockGetAccountByBaseUrlAndUserId,
  mockInvalidateResolvedApiTokenKeyCache,
  mockNormalizeApiTokenKey,
  mockSyncResolvedApiTokenKeyCache,
} = vi.hoisted(() => ({
  mockGetAccountById: vi.fn(),
  mockGetAccountByBaseUrlAndUserId: vi.fn(),
  mockInvalidateResolvedApiTokenKeyCache: vi.fn(),
  mockNormalizeApiTokenKey: vi.fn((token: any) => ({
    ...token,
    normalized: true,
  })),
  mockSyncResolvedApiTokenKeyCache: vi.fn(),
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

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: mockGetAccountById,
    getAccountByBaseUrlAndUserId: mockGetAccountByBaseUrlAndUserId,
  },
}))

vi.mock("~/services/apiService/common/apiKey", () => ({
  normalizeApiTokenKey: mockNormalizeApiTokenKey,
}))

vi.mock("~/services/apiService/common/constant", () => ({
  REQUEST_CONFIG: {
    DEFAULT_PAGE_SIZE: 2,
    MAX_PAGES: 2,
  },
}))

vi.mock("~/services/apiService/common/tokenKeyResolver", () => ({
  fetchTokenSecretKeyById: vi.fn(),
  invalidateResolvedApiTokenKeyCache: mockInvalidateResolvedApiTokenKeyCache,
  resolveApiTokenKey: vi.fn(),
  syncResolvedApiTokenKeyCache: mockSyncResolvedApiTokenKeyCache,
}))

vi.mock("~/services/apiService/common/pagination", () => ({
  fetchAllItems: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  aggregateUsageData: mockAggregateUsageData,
  extractAmount: mockExtractAmount,
  fetchApi: mockFetchApi,
  fetchApiData: mockFetchApiData,
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

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
  ),
}))

const baseRequest = {
  baseUrl: "https://example.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "token",
    userId: 7,
  },
}

describe("apiService common account-data helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    mockGetTodayTimestampRange.mockReturnValue({
      start: 111,
      end: 222,
    })
    mockGetAccountById.mockResolvedValue(null)
    mockGetAccountByBaseUrlAndUserId.mockResolvedValue(null)
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

  it("fetchSiteStatus forces public auth and returns the status payload", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      checkin_enabled: true,
      price: 2.5,
    })

    const result = await fetchSiteStatus(baseRequest)

    expect(mockFetchApiData).toHaveBeenCalledWith(
      {
        ...baseRequest,
        auth: { authType: AuthTypeEnum.None },
      },
      { endpoint: "/api/status" },
    )
    expect(result).toEqual({ checkin_enabled: true, price: 2.5 })
  })

  it("searchChannel returns data on success and null on failure", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({ items: [{ id: 1 }], total: 1 })
      .mockRejectedValueOnce(new ApiError("denied", 403))

    await expect(searchChannel(baseRequest, "gpt-4")).resolves.toEqual({
      items: [{ id: 1 }],
      total: 1,
    })
    await expect(searchChannel(baseRequest, "gpt-4")).resolves.toBeNull()
  })

  it("createChannel serializes groups and wraps transport failures", async () => {
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("network"))

    await expect(
      createChannel(baseRequest, {
        name: "My Channel",
        channel: {
          name: "inner",
          groups: ["default", "vip"],
        },
      } as any),
    ).resolves.toEqual({ success: true })

    expect(mockFetchApi).toHaveBeenNthCalledWith(
      1,
      baseRequest,
      expect.objectContaining({
        endpoint: "/api/channel/",
        options: {
          method: "POST",
          body: JSON.stringify({
            name: "My Channel",
            channel: {
              name: "inner",
              groups: ["default", "vip"],
              group: "default,vip",
            },
          }),
        },
      }),
    )

    await expect(
      createChannel(baseRequest, {
        channel: { groups: [] },
      } as any),
    ).rejects.toThrow("创建渠道失败，请检查网络或 New API 配置。")
  })

  it("updateChannel and deleteChannel wrap transport failures with user-facing messages", async () => {
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("update failed"))
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("delete failed"))

    await expect(
      updateChannel(baseRequest, { id: 1, name: "Updated" } as any),
    ).resolves.toEqual({ success: true })
    await expect(
      updateChannel(baseRequest, { id: 1, name: "Updated" } as any),
    ).rejects.toThrow("更新渠道失败，请检查网络或 New API 配置。")

    await expect(deleteChannel(baseRequest, 1)).resolves.toEqual({
      success: true,
    })
    await expect(deleteChannel(baseRequest, 1)).rejects.toThrow(
      "删除渠道失败，请检查网络或 New API 配置。",
    )
  })

  it("fetchSiteStatus returns null when the status endpoint fails", async () => {
    mockFetchApiData.mockRejectedValueOnce(new Error("status failed"))

    await expect(fetchSiteStatus(baseRequest)).resolves.toBeNull()
  })

  it("extractDefaultExchangeRate follows the documented fallback order", () => {
    expect(extractDefaultExchangeRate(null)).toBeNull()
    expect(extractDefaultExchangeRate({ price: 2.5 } as any)).toBe(2.5)
    expect(
      extractDefaultExchangeRate({ price: 0, stripe_unit_price: 3 } as any),
    ).toBe(3)
    expect(
      extractDefaultExchangeRate({
        price: 0,
        stripe_unit_price: 0,
        PaymentUSDRate: 4,
      } as any),
    ).toBe(4)
    expect(
      extractDefaultExchangeRate({
        price: -1,
        stripe_unit_price: 0,
        PaymentUSDRate: 0,
      } as any),
    ).toBeNull()
  })

  it("fetchUserInfo returns the normalized public shape", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      id: 9,
      username: "alice",
      access_token: "",
      quota: 123,
    })

    await expect(fetchUserInfo(baseRequest)).resolves.toEqual({
      id: 9,
      username: "alice",
      access_token: "",
      user: {
        id: 9,
        username: "alice",
        access_token: "",
        quota: 123,
      },
    })
  })

  it("createAccessToken delegates to the token endpoint", async () => {
    mockFetchApiData.mockResolvedValueOnce("new-token")

    await expect(createAccessToken(baseRequest)).resolves.toBe("new-token")
    expect(mockFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: "/api/user/token",
    })
  })

  it("getOrCreateAccessToken reuses the existing token when present", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      id: 1,
      username: "alice",
      access_token: "existing-token",
    })

    await expect(getOrCreateAccessToken(baseRequest)).resolves.toEqual({
      username: "alice",
      access_token: "existing-token",
    })
    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it("getOrCreateAccessToken creates a token when the account has none", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        id: 1,
        username: "alice",
        access_token: "",
      })
      .mockResolvedValueOnce("generated-token")

    await expect(getOrCreateAccessToken(baseRequest)).resolves.toEqual({
      username: "alice",
      access_token: "generated-token",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, baseRequest, {
      endpoint: "/api/user/token",
    })
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

  it("fetchSupportCheckIn forwards the site flag from fetchSiteStatus", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      checkin_enabled: false,
    })

    await expect(fetchSupportCheckIn(baseRequest)).resolves.toBe(false)
  })

  it("fetchPaymentInfo unwraps the normal payload", async () => {
    mockFetchApi.mockResolvedValueOnce({ paid: true })

    await expect(fetchPaymentInfo(baseRequest)).resolves.toEqual({ paid: true })
    expect(mockFetchApi).toHaveBeenCalledWith(
      baseRequest,
      { endpoint: "/api/user/payment" },
      true,
    )
  })

  it("fetchPaymentInfo rethrows upstream failures", async () => {
    const error = new Error("payment failed")
    mockFetchApi.mockRejectedValueOnce(error)

    await expect(fetchPaymentInfo(baseRequest)).rejects.toBe(error)
    expect(mockLoggerError).toHaveBeenCalledWith("获取支付信息失败", error)
  })

  it("fetchTodayUsage short-circuits when cashflow collection is disabled", async () => {
    await expect(
      fetchTodayUsage({
        ...baseRequest,
        includeTodayCashflow: false,
      } as any),
    ).resolves.toEqual({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
    })
    expect(mockFetchApiData).not.toHaveBeenCalled()
  })

  it("fetchTodayUsage uses the stat endpoint plus a lightweight count query", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        quota: 60,
      })
      .mockResolvedValueOnce({
        items: [{ quota: 10, prompt_tokens: 2, completion_tokens: 3 }],
        total: 3,
      })

    await expect(fetchTodayUsage(baseRequest as any)).resolves.toEqual({
      today_quota_consumption: 60,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 3,
    })

    expect(mockFetchApiData).toHaveBeenNthCalledWith(1, baseRequest, {
      endpoint: `/api/log/self/stat?${new URLSearchParams({
        p: "1",
        page_size: "2",
        type: String(LogType.Consume),
        token_name: "",
        model_name: "",
        start_timestamp: "111",
        end_timestamp: "222",
        group: "",
      }).toString()}`,
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, baseRequest, {
      endpoint: `/api/log/self?${new URLSearchParams({
        p: "1",
        page_size: "1",
        type: String(LogType.Consume),
        token_name: "",
        model_name: "",
        start_timestamp: "111",
        end_timestamp: "222",
        group: "",
      }).toString()}`,
    })
  })

  it("fetchTodayUsage falls back to full log aggregation when the fast path fails", async () => {
    mockFetchApiData
      .mockRejectedValueOnce(new Error("stat unavailable"))
      .mockResolvedValueOnce({
        items: [{ quota: 999 }],
        total: 999,
      })
      .mockResolvedValueOnce({
        items: [{ quota: 10, prompt_tokens: 2, completion_tokens: 3 }],
        total: 99,
      })
      .mockResolvedValueOnce({
        items: [{ quota: 20, prompt_tokens: 4, completion_tokens: 5 }],
        total: 99,
      })

    await expect(fetchTodayUsage(baseRequest as any)).resolves.toEqual({
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

  it("fetchTodayIncome short-circuits when cashflow collection is disabled", async () => {
    await expect(
      fetchTodayIncome({
        ...baseRequest,
        includeTodayCashflow: false,
      } as any),
    ).resolves.toEqual({ today_income: 0 })
    expect(mockGetAccountById).not.toHaveBeenCalled()
  })

  it("fetchTodayIncome uses the account exchange rate and parses quota fallbacks", async () => {
    mockGetAccountById.mockResolvedValueOnce({ exchange_rate: 9 })
    mockExtractAmount.mockReturnValueOnce({ amount: 3 })
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ quota: 50 }, { content: "recharge 3 USD" }],
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [{ quota: 25 }],
        total: 3,
      })

    await expect(
      fetchTodayIncome({
        ...baseRequest,
        accountId: "account-1",
      } as any),
    ).resolves.toEqual({ today_income: 375 })

    expect(mockGetAccountById).toHaveBeenCalledWith("account-1")
    expect(mockExtractAmount).toHaveBeenCalledWith("recharge 3 USD", 9)
  })

  it("fetchTodayIncome falls back to lookup by baseUrl and userId when accountId is absent", async () => {
    mockGetAccountByBaseUrlAndUserId.mockResolvedValueOnce({ exchange_rate: 8 })
    mockFetchApiData
      .mockResolvedValueOnce({
        items: [{ quota: 20 }],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
      })

    await expect(fetchTodayIncome(baseRequest as any)).resolves.toEqual({
      today_income: 20,
    })
    expect(mockGetAccountByBaseUrlAndUserId).toHaveBeenCalledWith(
      baseRequest.baseUrl,
      7,
    )
  })

  it("fetchAccountData preserves existing siteStatus when detection is disabled", async () => {
    mockFetchApiData.mockResolvedValueOnce({ quota: 321 })

    const result = await fetchAccountData({
      ...baseRequest,
      includeTodayCashflow: false,
      checkIn: {
        enableDetection: false,
        siteStatus: {
          isCheckedInToday: true,
          lastDetectedAt: 1234,
        },
      },
    } as any)

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
    mockFetchApiData
      .mockResolvedValueOnce({ quota: 99 })
      .mockResolvedValueOnce({
        stats: {
          checked_in_today: false,
        },
      })

    const result = await fetchAccountData({
      ...baseRequest,
      includeTodayCashflow: false,
      checkIn: {
        enableDetection: true,
        siteStatus: {},
      },
    } as any)

    expect(result.checkIn.siteStatus).toEqual({
      isCheckedInToday: false,
      lastDetectedAt: Date.parse("2026-03-28T12:00:00.000Z"),
    })
  })

  it("fetchAccountTokens normalizes array and paginated responses", async () => {
    mockFetchApiData
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce({ items: [{ id: 3 }] })

    await expect(fetchAccountTokens(baseRequest)).resolves.toEqual([
      { id: 1, normalized: true },
      { id: 2, normalized: true },
    ])
    await expect(fetchAccountTokens(baseRequest, 2, 10)).resolves.toEqual([
      { id: 3, normalized: true },
    ])
    expect(mockSyncResolvedApiTokenKeyCache).toHaveBeenCalledTimes(2)
  })

  it("updateChannelModels and updateChannelModelMapping validate response envelopes", async () => {
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "bad models" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "bad mapping" })

    await expect(
      updateChannelModels(baseRequest, 1, "gpt-4,gpt-4o"),
    ).resolves.toBeUndefined()
    await expect(
      updateChannelModels(baseRequest, 1, "gpt-4,gpt-4o"),
    ).rejects.toMatchObject({ message: "bad models" })

    await expect(
      updateChannelModelMapping(baseRequest, 1, "gpt-4", '{"gpt-4":"gpt-4o"}'),
    ).resolves.toBeUndefined()
    await expect(
      updateChannelModelMapping(baseRequest, 1, "gpt-4", '{"gpt-4":"gpt-4o"}'),
    ).rejects.toMatchObject({ message: "bad mapping" })
  })

  it("fetchAccountTokens returns an empty list for unexpected payloads", async () => {
    mockFetchApiData.mockResolvedValueOnce({ something: "else" })

    await expect(fetchAccountTokens(baseRequest)).resolves.toEqual([])
    expect(mockSyncResolvedApiTokenKeyCache).toHaveBeenCalledWith(
      baseRequest,
      [],
    )
  })

  it("fetchAccountTokens and related fetch helpers rethrow upstream failures", async () => {
    const tokensError = new Error("tokens unavailable")
    const modelsError = new Error("models unavailable")
    const groupsError = new Error("groups unavailable")
    const siteGroupsError = new Error("site groups unavailable")
    const tokenError = new Error("token unavailable")
    const redeemError = new Error("redeem unavailable")

    mockFetchApiData
      .mockRejectedValueOnce(tokensError)
      .mockRejectedValueOnce(modelsError)
      .mockRejectedValueOnce(groupsError)
      .mockRejectedValueOnce(siteGroupsError)
      .mockRejectedValueOnce(tokenError)
      .mockRejectedValueOnce(redeemError)

    await expect(fetchAccountTokens(baseRequest)).rejects.toBe(tokensError)
    await expect(fetchAccountAvailableModels(baseRequest)).rejects.toBe(
      modelsError,
    )
    await expect(fetchUserGroups(baseRequest)).rejects.toBe(groupsError)
    await expect(fetchSiteUserGroups(baseRequest)).rejects.toBe(siteGroupsError)
    await expect(fetchTokenById(baseRequest, 9)).rejects.toBe(tokenError)
    await expect(redeemCode(baseRequest, "promo-123")).rejects.toBe(redeemError)
  })

  it("fetchAccountAvailableModels and fetchUserGroups delegate to their endpoints", async () => {
    mockFetchApiData
      .mockResolvedValueOnce(["gpt-4.1", "claude-3.7"])
      .mockResolvedValueOnce({ default: { quota: 1 } })
      .mockResolvedValueOnce(["default", "vip"])

    await expect(fetchAccountAvailableModels(baseRequest)).resolves.toEqual([
      "gpt-4.1",
      "claude-3.7",
    ])
    await expect(fetchUserGroups(baseRequest)).resolves.toEqual({
      default: { quota: 1 },
    })
    await expect(fetchSiteUserGroups(baseRequest)).resolves.toEqual([
      "default",
      "vip",
    ])
  })

  it("createApiToken, fetchTokenById, updateApiToken, and deleteApiToken manage token flows", async () => {
    mockFetchApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "update failed" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "delete failed" })
    mockFetchApiData.mockResolvedValueOnce({ id: 9, key: "sk-123" })

    await expect(
      createApiToken(baseRequest, { name: "CLI", expired_time: -1 } as any),
    ).resolves.toBe(true)
    await expect(fetchTokenById(baseRequest, 9)).resolves.toEqual({
      id: 9,
      key: "sk-123",
      normalized: true,
    })
    await expect(
      updateApiToken(baseRequest, 9, { name: "CLI", expired_time: -1 } as any),
    ).resolves.toBe(true)
    await expect(
      updateApiToken(baseRequest, 9, { name: "CLI", expired_time: -1 } as any),
    ).rejects.toMatchObject({ message: "update failed" })
    await expect(deleteApiToken(baseRequest, 9)).resolves.toBe(true)
    await expect(deleteApiToken(baseRequest, 9)).rejects.toMatchObject({
      message: "delete failed",
    })

    expect(mockInvalidateResolvedApiTokenKeyCache).toHaveBeenCalledTimes(3)
  })

  it("createApiToken rethrows failed create responses and transport failures", async () => {
    const transportError = new Error("create transport failed")

    mockFetchApi
      .mockResolvedValueOnce({ success: false, message: "create failed" })
      .mockRejectedValueOnce(transportError)

    await expect(
      createApiToken(baseRequest, { name: "CLI", expired_time: -1 } as any),
    ).rejects.toMatchObject({ message: "create failed" })
    await expect(
      createApiToken(baseRequest, { name: "CLI", expired_time: -1 } as any),
    ).rejects.toBe(transportError)
  })

  it("fetchModelPricing and redeemCode delegate to their upstream endpoints", async () => {
    mockFetchApi.mockResolvedValueOnce({
      data: [{ model_name: "gpt-4.1", model_ratio: 1 }],
      group_ratio: { default: 1 },
      usable_group: { default: "Default" },
      success: true,
    })
    mockFetchApiData.mockResolvedValueOnce(500)

    await expect(fetchModelPricing(baseRequest)).resolves.toEqual({
      data: [{ model_name: "gpt-4.1", model_ratio: 1 }],
      group_ratio: { default: 1 },
      usable_group: { default: "Default" },
      success: true,
    })
    await expect(redeemCode(baseRequest, "promo-123")).resolves.toBe(500)
  })

  it("fetchModelPricing rethrows upstream failures", async () => {
    const error = new Error("pricing unavailable")
    mockFetchApi.mockRejectedValueOnce(error)

    await expect(fetchModelPricing(baseRequest)).rejects.toBe(error)
    expect(mockLoggerError).toHaveBeenCalledWith("获取模型定价失败", error)
  })

  it("refreshAccountData wraps successful refreshes with a healthy status", async () => {
    mockFetchApiData.mockResolvedValueOnce({ quota: 88 })

    await expect(
      refreshAccountData({
        ...baseRequest,
        includeTodayCashflow: false,
        checkIn: {
          enableDetection: false,
          siteStatus: {},
        },
      } as any),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({ quota: 88 }),
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "account:healthStatus.normal",
      },
    })
  })

  it("refreshAccountData maps runtime failures through determineHealthStatus", async () => {
    mockFetchApiData.mockRejectedValueOnce(
      new ApiError(
        "fallback disabled",
        undefined,
        "/api/user/self",
        API_ERROR_CODES.TEMP_WINDOW_DISABLED,
      ),
    )

    await expect(
      refreshAccountData({
        ...baseRequest,
        includeTodayCashflow: false,
        checkIn: {
          enableDetection: false,
          siteStatus: {},
        },
      } as any),
    ).resolves.toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Warning,
        message: "account:healthStatus.tempWindowDisabled",
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      },
    })
  })

  it("validateAccountConnection reflects whether quota fetch succeeds", async () => {
    mockFetchApiData.mockResolvedValueOnce({ quota: 1 })
    await expect(validateAccountConnection(baseRequest)).resolves.toBe(true)

    mockFetchApiData.mockRejectedValueOnce(new Error("offline"))
    await expect(validateAccountConnection(baseRequest)).resolves.toBe(false)
  })

  it("determineHealthStatus handles ApiError, network, and unknown failures", () => {
    expect(
      determineHealthStatus(
        new ApiError(
          "permission required",
          undefined,
          "/api/user/self",
          API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED,
        ),
      ),
    ).toEqual({
      status: SiteHealthStatus.Warning,
      message: "account:healthStatus.tempWindowPermissionRequired",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
    })

    expect(
      determineHealthStatus(
        new ApiError("rate limited", 429, "/api/user/self"),
      ),
    ).toEqual({
      status: SiteHealthStatus.Warning,
      message:
        'account:healthStatus.httpError:{"statusCode":429,"message":"rate limited"}',
    })

    expect(determineHealthStatus(new ApiError("bad payload"))).toEqual({
      status: SiteHealthStatus.Unknown,
      message: "bad payload",
    })

    expect(determineHealthStatus(new TypeError("failed to fetch"))).toEqual({
      status: SiteHealthStatus.Error,
      message: "account:healthStatus.networkFailed",
    })

    expect(determineHealthStatus(new Error("mystery"))).toEqual({
      status: SiteHealthStatus.Unknown,
      message: "mystery",
    })
  })
})
