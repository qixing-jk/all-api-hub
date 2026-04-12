import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchAccountData,
  fetchCheckInStatus,
  fetchSupportCheckIn,
  refreshAccountData,
  resolveApiTokenKey,
} from "~/services/apiService/wong"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const {
  mockDetermineHealthStatus,
  mockFetchAccountQuota,
  mockFetchApi,
  mockFetchApiData,
  mockFetchTodayIncome,
  mockFetchTodayUsage,
  mockT,
} = vi.hoisted(() => ({
  mockDetermineHealthStatus: vi.fn(),
  mockFetchAccountQuota: vi.fn(),
  mockFetchApi: vi.fn(),
  mockFetchApiData: vi.fn(),
  mockFetchTodayIncome: vi.fn(),
  mockFetchTodayUsage: vi.fn(),
  mockT: vi.fn((key: string) => `translated:${key}`),
}))

vi.mock("~/services/apiService/common", () => ({
  determineHealthStatus: mockDetermineHealthStatus,
  fetchAccountQuota: mockFetchAccountQuota,
  fetchTodayIncome: mockFetchTodayIncome,
  fetchTodayUsage: mockFetchTodayUsage,
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: mockFetchApi,
  fetchApiData: mockFetchApiData,
}))

vi.mock("~/utils/i18n/core", () => ({
  t: mockT,
}))

describe("apiService wong", () => {
  const baseRequest = {
    baseUrl: "https://wong.example.com",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: 1,
      accessToken: "token",
    },
    checkIn: {
      enableDetection: true,
      siteStatus: {
        isCheckedInToday: false,
        lastDetectedAt: 111,
      },
    },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchApiData.mockReset()
    mockDetermineHealthStatus.mockReturnValue({
      status: SiteHealthStatus.Unknown,
      message: "mapped error",
    })
    mockFetchAccountQuota.mockResolvedValue(1200)
    mockFetchTodayUsage.mockResolvedValue({
      today_quota_consumption: 10,
      today_prompt_tokens: 20,
      today_completion_tokens: 30,
      today_requests_count: 2,
    })
    mockFetchTodayIncome.mockResolvedValue({
      today_income: 50,
    })
  })

  it("reports check-in support only when the status endpoint returns a detectable result", async () => {
    mockFetchApi
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          enabled: false,
          checked_in: false,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        message: "今天已经签到过啦",
      })

    await expect(fetchSupportCheckIn(baseRequest)).resolves.toBe(false)
    await expect(fetchSupportCheckIn(baseRequest)).resolves.toBe(true)
  })

  it("normalizes none-auth requests before calling the WONG check-in endpoint", async () => {
    mockFetchApi.mockResolvedValueOnce({
      success: true,
      message: "",
      data: {
        enabled: true,
        checked_in: false,
      },
    })

    await expect(
      fetchCheckInStatus({
        ...baseRequest,
        auth: {
          authType: AuthTypeEnum.None,
          accessToken: "",
          userId: 1,
        },
      }),
    ).resolves.toBe(true)

    expect(mockFetchApi).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          authType: AuthTypeEnum.AccessToken,
        }),
      }),
      expect.objectContaining({
        endpoint: "/api/user/checkin",
        options: expect.objectContaining({
          method: "GET",
          cache: "no-store",
        }),
      }),
      false,
    )
  })

  it("treats already-checked messages and checked_in payloads as not eligible for check-in", async () => {
    mockFetchApi
      .mockResolvedValueOnce({
        success: true,
        message: "Already checked in for today",
      })
      .mockResolvedValueOnce({
        success: false,
        message: "",
        data: {
          enabled: true,
          checked_in: true,
        },
      })

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBe(false)
    await expect(fetchCheckInStatus(baseRequest)).resolves.toBe(false)
  })

  it("returns undefined for unsupported or malformed check-in responses", async () => {
    mockFetchApi
      .mockResolvedValueOnce({
        success: false,
        message: "server unavailable",
        data: {
          enabled: true,
          checked_in: false,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          enabled: true,
        },
      })

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
  })

  it("swallows status endpoint failures and reports an unknown check-in state", async () => {
    mockFetchApi.mockRejectedValueOnce(new Error("endpoint down"))

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
  })

  it("builds account data with detected check-in timestamps and unknown-status fallback", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    mockFetchApi.mockResolvedValueOnce({
      success: false,
      message: "backend refused to say",
      data: {
        enabled: true,
        checked_in: false,
      },
    })

    const result = await fetchAccountData(baseRequest)

    expect(result).toMatchObject({
      quota: 1200,
      today_income: 50,
      today_quota_consumption: 10,
      today_prompt_tokens: 20,
      today_completion_tokens: 30,
      today_requests_count: 2,
      checkIn: {
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: undefined,
          lastDetectedAt: 1_700_000_000_000,
        },
      },
    })

    nowSpy.mockRestore()
  })

  it("preserves the last known check-in state when detection is disabled", async () => {
    const result = await fetchAccountData({
      ...baseRequest,
      checkIn: {
        enableDetection: false,
        siteStatus: {
          isCheckedInToday: true,
          lastDetectedAt: 555,
        },
      },
    })

    expect(result.checkIn.siteStatus).toEqual({
      isCheckedInToday: true,
      lastDetectedAt: 555,
    })
    expect(mockFetchApi).not.toHaveBeenCalled()
  })

  it("returns a healthy refresh result when account aggregation succeeds", async () => {
    mockFetchApi.mockResolvedValueOnce({
      success: true,
      message: "",
      data: {
        enabled: true,
        checked_in: false,
      },
    })

    const result = await refreshAccountData(baseRequest)

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        quota: 1200,
        checkIn: expect.objectContaining({
          siteStatus: expect.objectContaining({
            isCheckedInToday: false,
          }),
        }),
      }),
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "translated:account:healthStatus.normal",
      },
    })
  })

  it("maps refresh failures through determineHealthStatus", async () => {
    mockFetchAccountQuota.mockRejectedValueOnce(new Error("quota failed"))

    const result = await refreshAccountData(baseRequest)

    expect(result).toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Unknown,
        message: "mapped error",
      },
    })
    expect(mockDetermineHealthStatus).toHaveBeenCalled()
  })

  it("resolves masked WONG token secrets with GET /api/token/{id}/key", async () => {
    mockFetchApiData.mockResolvedValueOnce({ key: "resolved-secret" })

    await expect(
      resolveApiTokenKey(baseRequest, {
        id: 7,
        key: "sk-abcd************wxyz",
      } as any),
    ).resolves.toBe("sk-resolved-secret")

    expect(mockFetchApiData).toHaveBeenCalledWith(baseRequest, {
      endpoint: "/api/token/7/key",
      options: {
        method: "GET",
      },
    })
  })

  it("surfaces missing WONG token secret payloads as resolution failures", async () => {
    mockFetchApiData.mockResolvedValueOnce({})

    await expect(
      resolveApiTokenKey(baseRequest, {
        id: 8,
        key: "sk-efgh************uvwx",
      } as any),
    ).rejects.toThrow("token_secret_key_missing")
  })
})
