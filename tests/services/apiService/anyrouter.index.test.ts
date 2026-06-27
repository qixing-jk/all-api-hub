import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchAccountData,
  fetchCheckInStatus,
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/anyrouter"
import { SiteHealthStatus } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

const {
  mockDetermineHealthStatus,
  mockFetchAccountQuota,
  mockFetchTodayIncome,
  mockFetchTodayUsage,
  mockCheckIn,
  mockT,
} = vi.hoisted(() => ({
  mockDetermineHealthStatus: vi.fn(),
  mockFetchAccountQuota: vi.fn(),
  mockFetchTodayIncome: vi.fn(),
  mockFetchTodayUsage: vi.fn(),
  mockCheckIn: vi.fn(),
  mockT: vi.fn((key: string) => `translated:${key}`),
}))

vi.mock("~/services/apiService/common", () => ({
  determineHealthStatus: mockDetermineHealthStatus,
  fetchAccountQuota: mockFetchAccountQuota,
  fetchTodayIncome: mockFetchTodayIncome,
  fetchTodayUsage: mockFetchTodayUsage,
}))

vi.mock("~/services/checkin/autoCheckin/providers/anyrouter", () => ({
  anyrouterProvider: {
    checkIn: mockCheckIn,
  },
}))

vi.mock("~/utils/i18n/core", () => ({
  t: mockT,
}))

describe("AnyRouter API service", () => {
  const baseRequest = {
    baseUrl: "https://anyrouter.example.com",
    auth: {
      authType: "cookie",
      userId: "42",
    },
    checkIn: {
      enableDetection: true,
      autoCheckInEnabled: true,
      siteStatus: {
        isCheckedInToday: false,
        lastDetectedAt: 111,
      },
      customCheckIn: {
        url: "",
        redeemUrl: "",
        openRedeemWithCheckIn: true,
      },
    },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
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

  it("always reports check-in support for AnyRouter sites", async () => {
    await expect(fetchSupportCheckIn(baseRequest)).resolves.toBe(true)
  })

  it("returns undefined when the AnyRouter user id is not numeric", async () => {
    const result = await fetchCheckInStatus({
      ...baseRequest,
      auth: { ...baseRequest.auth, userId: "not-a-number" },
    })

    expect(result).toBeUndefined()
    expect(mockCheckIn).not.toHaveBeenCalled()
  })

  it("accepts string user ids when they can be coerced into numbers", async () => {
    mockCheckIn.mockResolvedValueOnce({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
    })

    await expect(
      fetchCheckInStatus({
        ...baseRequest,
        auth: { ...baseRequest.auth, userId: "42" },
      }),
    ).resolves.toBe(true)

    expect(mockCheckIn).toHaveBeenCalledWith({
      site_url: "https://anyrouter.example.com",
      id: undefined,
      account_info: { id: 42 },
    })
  })

  it("passes request account identity to the AnyRouter check-in provider", async () => {
    mockCheckIn.mockResolvedValueOnce({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
    })

    await expect(
      fetchCheckInStatus({
        ...baseRequest,
        accountId: "stored-account-id",
        cookieAuthSessionCookie: "stored-session-cookie",
      }),
    ).resolves.toBe(true)

    expect(mockCheckIn).toHaveBeenCalledWith({
      site_url: "https://anyrouter.example.com",
      id: "stored-account-id",
      cookieAuthSessionCookie: "stored-session-cookie",
      account_info: { id: 42 },
    })
  })

  it("maps provider check-in statuses into the account-facing boolean", async () => {
    mockCheckIn
      .mockResolvedValueOnce({
        status: CHECKIN_RESULT_STATUS.SUCCESS,
      })
      .mockResolvedValueOnce({
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      })

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBe(true)
    await expect(fetchCheckInStatus(baseRequest)).resolves.toBe(false)

    expect(mockCheckIn).toHaveBeenNthCalledWith(1, {
      site_url: "https://anyrouter.example.com",
      id: undefined,
      account_info: { id: 42 },
    })
    expect(mockCheckIn).toHaveBeenNthCalledWith(2, {
      site_url: "https://anyrouter.example.com",
      id: undefined,
      account_info: { id: 42 },
    })
  })

  it("treats provider failures as unsupported check-in detection", async () => {
    mockCheckIn.mockRejectedValueOnce(new Error("provider down"))

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
  })

  it("builds account data with detected check-in status and timestamps", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    mockCheckIn.mockResolvedValueOnce({
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
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
          isCheckedInToday: true,
          lastDetectedAt: 1_700_000_000_000,
        },
      },
    })

    nowSpy.mockRestore()
  })

  it("preserves the last known check-in status when detection is disabled", async () => {
    const result = await fetchAccountData({
      ...baseRequest,
      checkIn: {
        ...baseRequest.checkIn,
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
    expect(mockCheckIn).not.toHaveBeenCalled()
  })

  it("keeps detected check-in status undefined when the provider cannot determine it", async () => {
    mockCheckIn.mockRejectedValueOnce(new Error("unsupported"))

    const result = await fetchAccountData(baseRequest)

    expect(result.checkIn.siteStatus).toEqual({
      isCheckedInToday: undefined,
      lastDetectedAt: expect.any(Number),
    })
  })

  it("returns a healthy refresh result when account aggregation succeeds", async () => {
    mockCheckIn.mockResolvedValueOnce({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
    })

    const result = await refreshAccountData(baseRequest)

    expect(result.success).toBe(true)
    expect(result.healthStatus).toEqual({
      status: SiteHealthStatus.Healthy,
      message: "translated:account:healthStatus.normal",
    })
    expect(result.data?.checkIn.siteStatus?.isCheckedInToday).toBe(false)
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
})
