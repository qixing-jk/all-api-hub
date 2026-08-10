import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchAccountData,
  fetchCheckInStatus,
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/anyrouter"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/inspection"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import { SiteHealthStatus } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"

import { createCheckInConfig } from "../apiAdapters/checkInFixtures"

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

vi.mock("~/services/accounts/accountHealth", () => ({
  determineHealthStatus: mockDetermineHealthStatus,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
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
  const backgroundProviderContext = {
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
    protectionBypassExecution: automaticExecution(
      PROTECTION_BYPASS_FEATURES.Checkin,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
    ),
  }
  const protectionBypassExecution =
    backgroundProviderContext.protectionBypassExecution
  const baseRequest = {
    baseUrl: "https://anyrouter.example.com",
    auth: {
      authType: "cookie",
      userId: "42",
    },
    siteType: SITE_TYPES.ANYROUTER,
    checkIn: {
      ...createCheckInConfig(SITE_TYPES.ANYROUTER, {
        isCheckedInToday: false,
        observedAt: 111,
      }),
      customCheckIn: {
        url: "",
        redeemUrl: "",
        openRedeemWithCheckIn: true,
      },
    },
    protectionBypassExecution,
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

    expect(mockCheckIn).toHaveBeenCalledWith(
      {
        site_url: "https://anyrouter.example.com",
        id: undefined,
        account_info: { id: 42 },
      },
      backgroundProviderContext,
    )
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

    expect(mockCheckIn).toHaveBeenCalledWith(
      {
        site_url: "https://anyrouter.example.com",
        id: "stored-account-id",
        cookieAuthSessionCookie: "stored-session-cookie",
        account_info: { id: 42 },
      },
      backgroundProviderContext,
    )
  })

  it("passes the Popup request source to the AnyRouter check-in provider", async () => {
    mockCheckIn.mockResolvedValueOnce({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
    })

    await fetchCheckInStatus({
      ...baseRequest,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
    })

    expect(mockCheckIn).toHaveBeenCalledWith(expect.any(Object), {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution: expect.objectContaining({
        feature: PROTECTION_BYPASS_FEATURES.Checkin,
      }),
    })
  })

  it("normalizes invalid AnyRouter request sources to Background", async () => {
    mockCheckIn.mockResolvedValueOnce({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
    })

    await fetchCheckInStatus({
      ...baseRequest,
      tempWindowRequestSource: "invalid-source",
    })

    expect(mockCheckIn).toHaveBeenCalledWith(
      expect.any(Object),
      backgroundProviderContext,
    )
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

    expect(mockCheckIn).toHaveBeenNthCalledWith(
      1,
      {
        site_url: "https://anyrouter.example.com",
        id: undefined,
        account_info: { id: 42 },
      },
      backgroundProviderContext,
    )
    expect(mockCheckIn).toHaveBeenNthCalledWith(
      2,
      {
        site_url: "https://anyrouter.example.com",
        id: undefined,
        account_info: { id: 42 },
      },
      backgroundProviderContext,
    )
  })

  it("treats provider failures as unsupported check-in detection", async () => {
    mockCheckIn.mockRejectedValueOnce(new Error("provider down"))

    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
  })

  it("keeps ordinary account refresh read-only for AnyRouter check-in", async () => {
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
      checkIn: baseRequest.checkIn,
    })
    expect(mockCheckIn).not.toHaveBeenCalled()
  })

  it("preserves check-in state when no method is selected", async () => {
    const result = await fetchAccountData({
      ...baseRequest,
      checkIn: createCheckInConfig(SITE_TYPES.ANYROUTER, {
        matched: false,
      }),
    })

    expect(result.checkIn.selection).not.toHaveProperty("methodId")
    expect(mockCheckIn).not.toHaveBeenCalled()
  })

  it("does not invoke the mutating provider during ordinary refresh", async () => {
    mockCheckIn.mockRejectedValueOnce(new Error("unsupported"))

    const result = await fetchAccountData(baseRequest)

    expect(
      getSelectedCheckInStatus({
        config: result.checkIn,
        siteType: SITE_TYPES.ANYROUTER,
      }),
    ).toEqual(
      getSelectedCheckInStatus({
        config: baseRequest.checkIn,
        siteType: SITE_TYPES.ANYROUTER,
      }),
    )
    expect(mockCheckIn).not.toHaveBeenCalled()
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
    expect(
      getSelectedCheckInStatus({
        config: result.data!.checkIn,
        siteType: SITE_TYPES.ANYROUTER,
      }),
    ).toMatchObject({ today: "not_checked" })
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
