import { beforeEach, describe, expect, it, vi } from "vitest"

import { CHECK_IN_METHOD_TODAY_STATUSES } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchAccountData,
  fetchCheckInStatus,
  fetchSupportCheckIn,
  refreshAccountData,
  resolveApiTokenKey,
} from "~/services/apiService/wong"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/inspection"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

import { createCheckInConfig } from "../../apiAdapters/checkInFixtures"

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

vi.mock("~/services/accounts/accountHealth", () => ({
  determineHealthStatus: mockDetermineHealthStatus,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  fetchAccountQuota: mockFetchAccountQuota,
  fetchTodayIncome: mockFetchTodayIncome,
  fetchTodayUsage: mockFetchTodayUsage,
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    data: mockFetchApiData,
    envelope: mockFetchApi,
  },
}))

vi.mock("~/services/apiTransport/request", () => ({
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
      userId: "1",
      accessToken: "token",
    },
    siteType: SITE_TYPES.WONG_GONGYI,
    checkIn: createCheckInConfig(SITE_TYPES.WONG_GONGYI, {
      isCheckedInToday: false,
      observedAt: 111,
    }),
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
          userId: "1",
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

  it("prefers an explicit unchecked payload over ambiguous message text", async () => {
    mockFetchApi.mockResolvedValueOnce({
      success: true,
      message: "User was not already checked in",
      data: {
        enabled: true,
        checked_in: false,
      },
    })

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBe(true)
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

  it("preserves the last known check-in state when status is inconclusive", async () => {
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
      checkIn: expect.any(Object),
    })
    expect(
      getSelectedCheckInStatus({
        config: result.checkIn,
        siteType: SITE_TYPES.WONG_GONGYI,
      }),
    ).toEqual(
      getSelectedCheckInStatus({
        config: baseRequest.checkIn,
        siteType: SITE_TYPES.WONG_GONGYI,
      }),
    )
  })

  it("preserves check-in state when no method is selected", async () => {
    const checkIn = createCheckInConfig(SITE_TYPES.WONG_GONGYI, {
      matched: false,
    })
    const result = await fetchAccountData({
      ...baseRequest,
      checkIn,
    })

    expect(result.checkIn).toEqual(checkIn)
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
        checkIn: expect.any(Object),
      }),
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "translated:account:healthStatus.normal",
      },
    })
    expect(
      getSelectedCheckInStatus({
        config: result.data!.checkIn,
        siteType: SITE_TYPES.WONG_GONGYI,
      }),
    ).toMatchObject({ today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked })
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
    ).resolves.toBe("resolved-secret")

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
