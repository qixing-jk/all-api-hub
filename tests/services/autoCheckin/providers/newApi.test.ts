import { beforeEach, describe, expect, it, vi } from "vitest"

import { NEW_API } from "~/constants/siteType"
import { newApiProvider } from "~/services/autoCheckin/providers/newApi"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: vi.fn(),
  fetchApiData: vi.fn(),
}))

vi.mock("~/utils/tempWindowFetch", () => ({
  tempWindowTurnstileFetch: vi.fn(),
}))

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return { ...actual, isAllowedIncognitoAccess: vi.fn() }
})

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "Test",
  site_url: "https://test.com",
  site_type: NEW_API,
  authType: AuthTypeEnum.AccessToken,
  exchange_rate: 7.0,
  notes: "",
  tagIds: [],
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

describe("newApiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("canCheckIn", () => {
    it("returns true for valid account", () => {
      expect(newApiProvider.canCheckIn(mockAccount)).toBe(true)
    })

    it("returns false when enableDetection is false", () => {
      const account = { ...mockAccount, checkIn: { enableDetection: false } }
      expect(newApiProvider.canCheckIn(account)).toBe(false)
    })

    it("returns false when no user id", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, id: 0 },
      }
      expect(newApiProvider.canCheckIn(account)).toBe(false)
    })

    it("returns false when token auth but access token is missing", () => {
      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.AccessToken,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(newApiProvider.canCheckIn(account)).toBe(false)
    })
  })

  describe("checkIn", () => {
    it("retries once via Turnstile-assisted temp context when message indicates Turnstile is required", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: true,
          message: "签到成功",
          data: { checkin_date: "2026-01-01", quota_awarded: 1 },
        },
        turnstile: { status: "token_obtained", hasTurnstile: true },
      })

      const account = {
        ...mockAccount,
        checkIn: {
          ...mockAccount.checkIn,
          customCheckIn: { url: "https://test.com/custom-checkin" },
        },
      }

      const result = await newApiProvider.checkIn(account)

      expect(result.status).toBe("success")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          originUrl: "https://test.com",
          pageUrl: "https://test.com/custom-checkin",
          fetchUrl: "https://test.com/api/user/checkin",
          responseType: "json",
          authType: AuthTypeEnum.AccessToken,
          turnstileTimeoutMs: 12000,
          turnstilePreTrigger: { kind: "checkinButton" },
        }),
      )
    })

    it("returns manual-required messaging when Turnstile token cannot be obtained", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile 校验失败，请刷新重试！",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.turnstileManualRequired",
      )
      expect(result.messageParams?.checkInUrl).toBe(
        "https://test.com/console/personal",
      )
    })

    it("returns already-checked when Turnstile token is missing but status confirms checked_in_today", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "not_present", hasTurnstile: false },
      })

      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.alreadyCheckedToday",
      )
    })

    it("retries in an incognito temp context when Turnstile widget is not present and checked_in_today is false", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/tempWindowFetch"
      )

      const { isAllowedIncognitoAccess } = await import("~/utils/browserApi")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch)
        .mockResolvedValueOnce({
          success: false,
          error: "Turnstile token not available",
          turnstile: { status: "not_present", hasTurnstile: false },
        })
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          headers: {},
          data: {
            success: true,
            message: "签到成功",
            data: { checkin_date: "2026-01-01", quota_awarded: 1 },
          },
          turnstile: { status: "token_obtained", hasTurnstile: true },
        })

      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(true)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("success")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(2)
      expect(tempWindowTurnstileFetch).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ useIncognito: true }),
      )
    })

    it("prompts to enable incognito access when incognito retry is needed but extension is not allowed in incognito", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/tempWindowFetch"
      )
      const { isAllowedIncognitoAccess } = await import("~/utils/browserApi")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "not_present", hasTurnstile: false },
      })

      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
      )
      expect(result.messageParams?.checkInUrl).toBe(
        "https://test.com/console/personal",
      )
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
    })

    it("does not trigger Turnstile flow for non-Turnstile failures", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Something went wrong",
        data: null,
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })
  })
})
