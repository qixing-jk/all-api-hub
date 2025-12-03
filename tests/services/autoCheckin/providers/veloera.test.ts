import { describe, expect, it, vi } from "vitest"

import { veloeraProvider } from "~/services/autoCheckin/providers/veloera"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: vi.fn(),
}))

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "Test",
  site_url: "https://test.com",
  site_type: "veloera",
  authType: AuthTypeEnum.AccessToken,
  exchange_rate: 7.0,
  notes: "",
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
  })

  describe("checkIn", () => {
    it("returns success on successful check-in", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        message: "Success",
      })

      const result = await veloeraProvider.checkIn(mockAccount)
      expect(result.status).toBe("success")
    })

    it("returns already_checked when already checked in", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        message: "已签到",
      })

      const result = await veloeraProvider.checkIn(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("handles errors gracefully", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      vi.mocked(fetchApi).mockRejectedValueOnce(new Error("Network error"))

      const result = await veloeraProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
    })
  })
})
