import { beforeEach, describe, expect, it, vi } from "vitest"

import { WONG_GONGYI } from "~/constants/siteType"
import { wongGongyiProvider } from "~/services/autoCheckin/providers/wong"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: vi.fn(),
}))

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "WONG公益站",
  site_url: "https://wong.example.com",
  site_type: WONG_GONGYI,
  authType: AuthTypeEnum.AccessToken,
  exchange_rate: 7.0,
  notes: "",
  checkIn: { enableDetection: true },
  health: { status: SiteHealthStatus.Healthy },
  account_info: {
    id: 123,
    access_token: "token",
    username: "test",
    quota: 1000,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: Date.now(),
  created_at: Date.now(),
  updated_at: Date.now(),
}

describe("wongGongyiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("canCheckIn", () => {
    it("returns true for valid account", () => {
      expect(wongGongyiProvider.canCheckIn(mockAccount)).toBe(true)
    })

    it("returns false when enableDetection is false", () => {
      const account = { ...mockAccount, checkIn: { enableDetection: false } }
      expect(wongGongyiProvider.canCheckIn(account)).toBe(false)
    })

    it("returns false when authType is token but token is missing", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(wongGongyiProvider.canCheckIn(account)).toBe(false)
    })
  })

  describe("checkIn", () => {
    it("returns already_checked when POST indicates checked_in true", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(fetchApi)

      mockedFetchApi.mockResolvedValueOnce({
        success: false,
        message: "",
        data: { enabled: true, checked_in: true },
      })

      const result = await wongGongyiProvider.checkIn(mockAccount)
      expect(result.status).toBe("already_checked")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.alreadyCheckedToday",
      )
    })

    it("returns already_checked when POST success=true but message indicates already checked", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(fetchApi)

      mockedFetchApi.mockResolvedValueOnce({
        success: true,
        message: "今天已经签到过啦",
        data: undefined,
      })

      const result = await wongGongyiProvider.checkIn(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("returns failed when POST indicates enabled false", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(fetchApi)

      mockedFetchApi.mockResolvedValueOnce({
        success: true,
        message: "",
        data: { enabled: false, checked_in: false },
      })

      const result = await wongGongyiProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe("autoCheckin:providerWong.checkinDisabled")
    })

    it("returns success when POST succeeds and user was not checked in", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(fetchApi)

      mockedFetchApi.mockResolvedValueOnce({
        success: true,
        message: "",
        data: { enabled: true, checked_in: false },
      })

      const result = await wongGongyiProvider.checkIn(mockAccount)
      expect(result.status).toBe("success")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.checkinSuccessful",
      )
    })

    it("returns failed when POST returns success=false without already-checked signal", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(fetchApi)

      mockedFetchApi.mockResolvedValueOnce({
        success: false,
        message: "",
        data: { enabled: true, checked_in: false },
      })

      const result = await wongGongyiProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.checkinFailed",
      )
    })

    it("returns already_checked when POST returns already checked message", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(fetchApi)

      mockedFetchApi.mockResolvedValueOnce({
        success: false,
        message: "今天已经签到过啦",
        data: null,
      })

      const result = await wongGongyiProvider.checkIn(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("handles network errors gracefully", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(fetchApi)

      mockedFetchApi.mockRejectedValueOnce(new Error("Network error"))

      const result = await wongGongyiProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
      expect(result.rawMessage).toBe("Network error")
    })

    it("returns endpointNotSupported when API returns 404", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(fetchApi)

      mockedFetchApi.mockRejectedValueOnce({
        statusCode: 404,
        message: "Not Found",
      })

      const result = await wongGongyiProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.endpointNotSupported",
      )
    })
  })
})
