import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { anyrouterProvider } from "~/services/checkin/autoCheckin/providers/anyrouter"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: vi.fn(),
}))

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "AnyRouter",
  site_url: "https://anyrouter.top",
  site_type: SITE_TYPES.ANYROUTER,
  authType: AuthTypeEnum.Cookie,
  exchange_rate: 7.0,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  checkIn: { enableDetection: true },
  health: { status: SiteHealthStatus.Healthy },
  account_info: {
    id: 12345,
    access_token: "",
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

describe("anyrouterProvider", () => {
  describe("canCheckIn", () => {
    it("returns true for valid account", () => {
      expect(anyrouterProvider.canCheckIn(mockAccount)).toBe(true)
    })

    it("returns false when enableDetection is false", () => {
      const account = { ...mockAccount, checkIn: { enableDetection: false } }
      expect(anyrouterProvider.canCheckIn(account)).toBe(false)
    })

    it("returns false when no user id", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, id: 0 },
      }
      expect(anyrouterProvider.canCheckIn(account)).toBe(false)
    })
  })

  describe("checkIn", () => {
    it("returns success on successful check-in (message includes 签到成功)", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 1,
        success: true,
        message: "签到成功，获得 $25 额度",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)
      expect(result.status).toBe("success")
    })

    it("returns success for English success messages", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 1,
        success: true,
        message: "Success! bonus quota granted",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "success",
        rawMessage: "Success! bonus quota granted",
        messageKey: undefined,
        data: {
          code: 1,
          ret: 1,
          success: true,
          message: "Success! bonus quota granted",
        },
      })
    })

    it("returns already_checked when response is success and message is empty", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: true,
        message: "",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("returns already_checked when response is success and message indicates a prior check-in", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: true,
        message: "already checked today",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "already_checked",
        rawMessage: "already checked today",
        messageKey: undefined,
      })
    })

    it("returns the fallback failure key when the backend fails without a message", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: false,
        message: "",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: {
          code: 1,
          ret: 0,
          success: false,
          message: "",
        },
      })
    })

    it("returns failed when a success response has no success or already-checked signal", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 1,
        success: true,
        message: "queued",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.rawMessage).toBe("queued")
    })

    it("returns failed when response is not success (even if message indicates already checked)", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: false,
        message: "已签到",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
    })

    it("returns failed when response indicates failure", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: false,
        message: "error",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
    })

    it("maps 404 errors to endpoint-not-supported", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockRejectedValueOnce({
        statusCode: 404,
        message: "Not found",
      })

      const result = await anyrouterProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
    })

    it("returns already_checked when request throws and error message indicates already checked", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockRejectedValueOnce(new Error("已签到"))

      const result = await anyrouterProvider.checkIn(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("handles errors gracefully", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockRejectedValueOnce(new Error("Network error"))

      const result = await anyrouterProvider.checkIn(mockAccount)
      expect(result.status).toBe("failed")
    })
  })
})
