import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/services/apiService/common/errors"
import {
  createChannel,
  fetchAccountData,
  fetchChannel,
  fetchCheckInStatus,
  listAllChannels,
  refreshAccountData,
  searchChannel,
  updateChannel,
} from "~/services/apiService/veloera"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const {
  mockDetermineHealthStatus,
  mockFetchAccountQuota,
  mockFetchTodayIncome,
  mockFetchTodayUsage,
} = vi.hoisted(() => ({
  mockDetermineHealthStatus: vi.fn(),
  mockFetchAccountQuota: vi.fn(),
  mockFetchTodayIncome: vi.fn(),
  mockFetchTodayUsage: vi.fn(),
}))

const { mockFetchApiData } = vi.hoisted(() => ({
  mockFetchApiData: vi.fn(),
}))

const { mockFetchApi } = vi.hoisted(() => ({
  mockFetchApi: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApiData: mockFetchApiData,
  fetchApi: mockFetchApi,
  aggregateUsageData: vi.fn(),
  extractAmount: vi.fn(),
  getTodayTimestampRange: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  determineHealthStatus: (...args: unknown[]) =>
    mockDetermineHealthStatus(...args),
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  fetchAccountQuota: (...args: unknown[]) => mockFetchAccountQuota(...args),
  fetchTodayIncome: (...args: unknown[]) => mockFetchTodayIncome(...args),
  fetchTodayUsage: (...args: unknown[]) => mockFetchTodayUsage(...args),
  resolveCheckInSiteStatus: (checkIn: any, canCheckIn: boolean | undefined) =>
    typeof canCheckIn === "boolean"
      ? {
          ...(checkIn.siteStatus ?? {}),
          isCheckedInToday: !canCheckIn,
          lastDetectedAt: Date.now(),
        }
      : checkIn.siteStatus,
}))

/**
 * Veloera channel API adapters.
 *
 * These tests ensure Veloera responses are normalized to match the New API
 * `ManagedSiteChannelListData` structure.
 */
describe("apiService veloera channel APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchAccountQuota.mockResolvedValue(100)
    mockFetchTodayUsage.mockResolvedValue({
      today_prompt_tokens: 11,
      today_completion_tokens: 22,
      today_quota_consumption: 33,
      today_requests_count: 44,
    })
    mockFetchTodayIncome.mockResolvedValue({
      today_income: 55,
    })
  })

  it("listAllChannels should paginate from p=0 and return New API compatible structure", async () => {
    const baseUrl = "https://example.com"
    const token = "token"
    const userId = 1
    const request = {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: token,
        userId,
      },
    }

    mockFetchApiData
      .mockResolvedValueOnce([
        { id: 1, type: 1, name: "c1" },
        { id: 2, type: 2, name: "c2" },
      ])
      .mockResolvedValueOnce([{ id: 3, type: 1, name: "c3" }])

    const result = await listAllChannels(request as any, {
      pageSize: 2,
    })

    expect(mockFetchApiData).toHaveBeenCalledTimes(2)

    const firstCallEndpoint = mockFetchApiData.mock.calls[0][1]
      .endpoint as string
    const secondCallEndpoint = mockFetchApiData.mock.calls[1][1]
      .endpoint as string

    expect(firstCallEndpoint).toContain("/api/channel/?")
    expect(firstCallEndpoint).toContain("p=0")
    expect(firstCallEndpoint).toContain("page_size=2")

    expect(secondCallEndpoint).toContain("/api/channel/?")
    expect(secondCallEndpoint).toContain("p=1")
    expect(secondCallEndpoint).toContain("page_size=2")

    expect(result.items).toHaveLength(3)
    expect(result.total).toBe(3)
    expect(result.type_counts).toEqual({ "1": 2, "2": 1 })
  })

  it("searchChannel should call search endpoint and normalize array payload", async () => {
    const baseUrl = "https://example.com"
    const token = "token"
    const userId = 1
    const request = {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: token,
        userId,
      },
    }

    mockFetchApiData.mockResolvedValueOnce([
      { id: 1, type: 1, name: "c1" },
      { id: 2, type: 2, name: "c2" },
    ])

    const result = await searchChannel(request as any, "k")

    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
    const callRequest = mockFetchApiData.mock.calls[0][0]
    const callOptions = mockFetchApiData.mock.calls[0][1]
    expect(callRequest.baseUrl).toBe(baseUrl)
    expect(callRequest.auth.userId).toBe(userId)
    expect(callRequest.auth.accessToken).toBe(token)
    expect(callOptions.endpoint).toContain("/api/channel/search")
    expect(callOptions.endpoint).toContain("keyword=")

    expect(result).not.toBeNull()
    expect(result!.items).toHaveLength(2)
    expect(result!.total).toBe(2)
    expect(result!.type_counts).toEqual({ "1": 1, "2": 1 })
  })

  it("fetchChannel should call the detail endpoint and normalize the payload", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
    }

    mockFetchApiData.mockResolvedValueOnce({
      id: 9,
      type: 1,
      name: "detail-channel",
      key: "sk-veloera-detail-key",
      base_url: "https://upstream.example.com",
      models: "gpt-4o",
    })

    const result = await fetchChannel(request as any, 9)

    expect(mockFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/channel/9",
    })
    expect(result).toMatchObject({
      id: 9,
      name: "detail-channel",
      key: "sk-veloera-detail-key",
      base_url: "https://upstream.example.com",
      models: "gpt-4o",
    })
  })

  it("fetchChannel should fill default channel_info and normalize numeric/string fallback fields", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
    }

    mockFetchApiData.mockResolvedValueOnce({
      id: "12",
      type: 2,
      name: "coerced-channel",
      key: null,
      status: "bad",
      priority: "7",
      balance: "bad",
      tag: undefined,
      setting: "legacy-setting",
    })

    const result = await fetchChannel(request as any, 12)

    expect(result).toMatchObject({
      id: 12,
      key: "",
      status: 0,
      priority: 7,
      balance: 0,
      tag: null,
      setting: "legacy-setting",
      settings: "legacy-setting",
      channel_info: {
        is_multi_key: false,
        multi_key_size: 0,
        multi_key_status_list: null,
        multi_key_polling_index: 0,
        multi_key_mode: "",
      },
    })
  })

  it("createChannel should post flat payload with group string", async () => {
    const baseUrl = "https://example.com"
    const token = "token"
    const userId = 1
    const request = {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: token,
        userId,
      },
    }

    mockFetchApi.mockResolvedValueOnce({ success: true, message: "ok" })

    await createChannel(request as any, {
      mode: "none" as any,
      channel: {
        name: "n",
        type: 1 as any,
        key: "k",
        base_url: "https://upstream.example.com",
        models: "gpt-4",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1 as any,
      },
    })

    expect(mockFetchApi).toHaveBeenCalledTimes(1)
    const callRequest = mockFetchApi.mock.calls[0][0]
    const callOptions = mockFetchApi.mock.calls[0][1]
    expect(callRequest.baseUrl).toBe(baseUrl)
    expect(callOptions.endpoint).toBe("/api/channel")
    expect(callRequest.auth.accessToken).toBe(token)
    expect(callRequest.auth.userId).toBe(userId)
    expect(callOptions.options?.method).toBe("POST")

    const body = JSON.parse(callOptions.options?.body as string)
    expect(body).toMatchObject({
      name: "n",
      type: 1,
      key: "k",
      base_url: "https://upstream.example.com",
      models: "gpt-4",
      priority: 0,
      weight: 0,
      status: 1,
      group: "default",
    })
    expect(body.groups).toBeUndefined()
  })

  it("updateChannel should put flat payload with group string", async () => {
    const baseUrl = "https://example.com"
    const token = "token"
    const userId = 1
    const request = {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: token,
        userId,
      },
    }

    mockFetchApi.mockResolvedValueOnce({ success: true, message: "ok" })

    await updateChannel(request as any, {
      id: 1,
      name: "Updated Channel",
      key: "k",
      base_url: "https://upstream.example.com",
      models: "gpt-4",
      groups: ["default"],
      priority: 0,
    })

    expect(mockFetchApi).toHaveBeenCalledTimes(1)
    const callRequest = mockFetchApi.mock.calls[0][0]
    const callOptions = mockFetchApi.mock.calls[0][1]
    expect(callRequest.baseUrl).toBe(baseUrl)
    expect(callOptions.endpoint).toBe("/api/channel")
    expect(callRequest.auth.accessToken).toBe(token)
    expect(callRequest.auth.userId).toBe(userId)
    expect(callOptions.options?.method).toBe("PUT")

    const body = JSON.parse(callOptions.options?.body as string)
    expect(body).toMatchObject({
      id: 1,
      name: "Updated Channel",
      key: "k",
      base_url: "https://upstream.example.com",
      models: "gpt-4",
      priority: 0,
      group: "default",
    })
    expect(body.groups).toBeUndefined()
  })

  it("searchChannel should accept object payloads with an items array and normalize them", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
    }

    mockFetchApiData.mockResolvedValueOnce({
      items: [{ id: "3", type: 4, name: "wrapped" }],
    })

    const result = await searchChannel(request as any, "wrapped")

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 3,
          type: 4,
          name: "wrapped",
        }),
      ],
      total: 1,
      type_counts: { "4": 1 },
    })
  })

  it("returns null when searchChannel receives an unsupported payload", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
    }

    mockFetchApiData.mockResolvedValueOnce({ unexpected: true })

    await expect(searchChannel(request as any, "wrapped")).resolves.toBeNull()
  })

  it("returns check-in availability only when the upstream value is explicitly boolean", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
    }

    mockFetchApiData
      .mockResolvedValueOnce({ can_check_in: true })
      .mockResolvedValueOnce({ can_check_in: "yes" })

    await expect(fetchCheckInStatus(request as any)).resolves.toBe(true)
    await expect(fetchCheckInStatus(request as any)).resolves.toBeUndefined()
  })

  it("treats 404 and other failures as unsupported check-in detection", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
    }

    mockFetchApiData
      .mockRejectedValueOnce(
        new ApiError("missing", 404, "/api/user/check_in_status"),
      )
      .mockRejectedValueOnce(new Error("network"))

    await expect(fetchCheckInStatus(request as any)).resolves.toBeUndefined()
    await expect(fetchCheckInStatus(request as any)).resolves.toBeUndefined()
  })

  it("aggregates quota, usage, income, and detected check-in state for account refreshes", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123456)
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
      checkIn: {
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: false,
          lastDetectedAt: 5,
        },
      },
    }

    mockFetchApiData.mockResolvedValueOnce({ can_check_in: false })

    const result = await fetchAccountData(request as any)

    expect(result).toMatchObject({
      quota: 100,
      today_prompt_tokens: 11,
      today_completion_tokens: 22,
      today_quota_consumption: 33,
      today_requests_count: 44,
      today_income: 55,
      checkIn: {
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: true,
          lastDetectedAt: 123456,
        },
      },
    })

    nowSpy.mockRestore()
  })

  it("preserves the last known check-in status when detection is disabled", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
      checkIn: {
        enableDetection: false,
        siteStatus: {
          isCheckedInToday: true,
          lastDetectedAt: 999,
        },
      },
    }

    const result = await fetchAccountData(request as any)

    expect(mockFetchApiData).not.toHaveBeenCalled()
    expect(result.checkIn.siteStatus).toEqual({
      isCheckedInToday: true,
      lastDetectedAt: 999,
    })
  })

  it("returns a healthy refresh result when account aggregation succeeds", async () => {
    mockFetchApiData.mockResolvedValueOnce({ can_check_in: true })

    const result = await refreshAccountData({
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
      checkIn: { enableDetection: true },
    } as any)

    expect(result.success).toBe(true)
    expect(result.data?.quota).toBe(100)
    expect(result.healthStatus.status).toBe(SiteHealthStatus.Healthy)
  })

  it("delegates refresh failures to determineHealthStatus", async () => {
    const failure = new Error("quota failed")
    mockFetchAccountQuota.mockRejectedValueOnce(failure)
    mockDetermineHealthStatus.mockReturnValueOnce({
      status: 2,
      message: "degraded",
    })

    const result = await refreshAccountData({
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
        userId: "1",
      },
      checkIn: { enableDetection: false },
    } as any)

    expect(mockDetermineHealthStatus).toHaveBeenCalledWith(failure)
    expect(result).toEqual({
      success: false,
      healthStatus: {
        status: 2,
        message: "degraded",
      },
    })
  })
})
