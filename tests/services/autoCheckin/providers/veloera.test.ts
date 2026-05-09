import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { veloeraProvider } from "~/services/checkin/autoCheckin/providers/veloera"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: vi.fn(),
}))

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "Test",
  site_url: "https://test.com",
  site_type: SITE_TYPES.VELOERA,
  authType: AuthTypeEnum.AccessToken,
  exchange_rate: 7.0,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  checkIn: { enableDetection: true },
  health: { status: SiteHealthStatus.Healthy },
  account_info: {
    id: 123,
    access_token: "test-token",
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

describe("veloeraProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("canCheckIn", () => {
    it("returns true for valid account", () => {
      expect(veloeraProvider.canCheckIn(mockAccount)).toBe(true)
    })

    it("returns false when enableDetection is false", () => {
      const account = { ...mockAccount, checkIn: { enableDetection: false } }
      expect(veloeraProvider.canCheckIn(account)).toBe(false)
    })

    it("returns false when no access token", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(veloeraProvider.canCheckIn(account)).toBe(false)
    })

    it("allows cookie-auth accounts without an access token", () => {
      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.Cookie,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }

      expect(veloeraProvider.canCheckIn(account)).toBe(true)
    })
  })

  describe("checkIn", () => {
    it("returns the fallback success message key when the backend omits a message", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        data: { quota_awarded: 2 },
        message: "",
      })

      const result = await veloeraProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "success",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
        data: { quota_awarded: 2 },
      })
    })

    it("returns success on successful check-in", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        data: null,
        message: "Success",
      })

      const result = await veloeraProvider.checkIn(mockAccount)
      expect(result.status).toBe("success")
    })

    it("returns already_checked when already checked in", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        data: null,
        message: "已签到",
      })

      const result = await veloeraProvider.checkIn(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("returns the fallback failure key when the backend fails without a message", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        data: { code: 500 },
        message: "",
      })

      const result = await veloeraProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: {
          success: false,
          data: { code: 500 },
          message: "",
        },
      })
    })

    it("maps 404-style error messages to endpoint-not-supported", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockRejectedValueOnce(new Error("404 Not found"))

      const result = await veloeraProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
    })

    it("handles errors gracefully", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockRejectedValueOnce(new Error("Network error"))

      const result = await veloeraProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
    })
  })
})
