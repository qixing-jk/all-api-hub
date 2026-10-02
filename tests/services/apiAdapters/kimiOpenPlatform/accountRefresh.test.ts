import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { kimiOpenPlatformAccountRefresh } from "~/services/apiAdapters/kimiOpenPlatform/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

import { createCheckInConfig } from "../checkInFixtures"

const { mockFetchKimiAccountData, mockReadKimiAuthState } = vi.hoisted(() => ({
  mockFetchKimiAccountData: vi.fn(),
  mockReadKimiAuthState: vi.fn(),
}))

vi.mock("~/services/apiService/kimiOpenPlatform", () => ({
  fetchKimiAccountData: mockFetchKimiAccountData,
}))

vi.mock("~/services/apiService/kimiOpenPlatform/transport", () => ({
  readKimiAuthState: mockReadKimiAuthState,
}))

const baseRequest = {
  baseUrl: "https://platform.kimi.com",
  accountId: "kimi-acc-1",
  siteType: SITE_TYPES.KIMI,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "current-access-jwt",
  },
  checkIn: createCheckInConfig(SITE_TYPES.KIMI, { matched: false }),
}

describe("kimiOpenPlatformAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("refreshes account data successfully and returns authUpdate when state is present", async () => {
    mockFetchKimiAccountData.mockResolvedValueOnce({
      quota: 500000,
      today_quota_consumption: 50000,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: {
        consumption: { status: "complete" },
        requests: { status: "unavailable", reason: "unsupported" },
        tokens: { status: "unavailable", reason: "unsupported" },
        income: { status: "unavailable", reason: "unsupported" },
      },
      checkIn: baseRequest.checkIn,
    })

    mockReadKimiAuthState.mockReturnValueOnce({
      accessToken: "refreshed-access-jwt",
      refreshToken: "refreshed-refresh-jwt",
      organizationId: "org-123",
      tokenExpiresAt: 1900000000000,
    })

    const result =
      await kimiOpenPlatformAccountRefresh.refreshAccount(baseRequest)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quota).toBe(500000)
      expect(result.data.today_quota_consumption).toBe(50000)
      expect(result.healthStatus.status).toBe(SiteHealthStatus.Healthy)
      expect(result.authUpdate).toEqual({
        accessToken: "refreshed-access-jwt",
        kimiOpenPlatformAuth: {
          refreshToken: "refreshed-refresh-jwt",
          organizationId: "org-123",
          tokenExpiresAt: 1900000000000,
        },
      })
    }
  })

  it("handles errors and maps them to unhealthy status", async () => {
    mockFetchKimiAccountData.mockRejectedValueOnce(new Error("network error"))
    mockReadKimiAuthState.mockReturnValueOnce(undefined)

    const result =
      await kimiOpenPlatformAccountRefresh.refreshAccount(baseRequest)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.healthStatus.status).not.toBe(SiteHealthStatus.Healthy)
    }
  })

  it("does not manufacture a console auth update for an API-key balance refresh", async () => {
    const data = { quota: 42, checkIn: baseRequest.checkIn }
    mockFetchKimiAccountData.mockResolvedValueOnce(data)
    mockReadKimiAuthState.mockReturnValueOnce(undefined)
    const result =
      await kimiOpenPlatformAccountRefresh.refreshAccount(baseRequest)
    expect(result).toMatchObject({ success: true, data })
    expect(result).not.toHaveProperty("authUpdate")
  })
})
