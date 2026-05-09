import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: vi.fn(),
  fetchApiData: vi.fn(),
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  tempWindowTurnstileFetch: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return { ...actual, isAllowedIncognitoAccess: vi.fn() }
})

const mockAccount = buildSiteAccount({
  id: "test-id",
  site_name: "Test",
  site_url: "https://test.com",
  site_type: SITE_TYPES.NEW_API,
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
})

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

    it("treats missing authType as access-token auth", () => {
      const account = {
        ...mockAccount,
        authType: undefined as any,
      }
      expect(newApiProvider.canCheckIn(account)).toBe(true)
    })

    it("requires an access token when authType is missing", () => {
      const account = {
        ...mockAccount,
        authType: undefined as any,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(newApiProvider.canCheckIn(account)).toBe(false)
    })

    it("allows cookie-auth accounts to check in without an access token", () => {
      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.Cookie,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(newApiProvider.canCheckIn(account)).toBe(true)
    })
  })

  describe("checkIn", () => {
    it("returns the default success message key when the upstream check-in succeeds without a message", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { checkin_date: "2026-01-01", quota_awarded: 1 },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "success",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
        data: { checkin_date: "2026-01-01", quota_awarded: 1 },
      })
    })

    it("treats upstream already-checked responses as already_checked results", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "今日已签到",
        data: { checkin_date: "2026-01-01" },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "already_checked",
        rawMessage: "今日已签到",
        data: { checkin_date: "2026-01-01" },
      })
    })

    it("uses the site check-in page for Turnstile-assisted temp context when Turnstile is required", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
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
          pageUrl: "https://test.com/console/personal",
          fetchUrl: "https://test.com/api/user/checkin",
          responseType: "json",
          authType: AuthTypeEnum.AccessToken,
          turnstileTimeoutMs: 12000,
          turnstilePreTrigger: { kind: "checkinButton" },
        }),
      )
    })

    it("defaults missing authType to AccessToken for direct check-in requests", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        message: "签到成功",
        data: { checkin_date: "2026-01-01", quota_awarded: 1 },
      })

      await newApiProvider.checkIn({
        ...mockAccount,
        authType: undefined as any,
      })

      expect(fetchApi).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            authType: AuthTypeEnum.AccessToken,
          }),
        }),
        expect.any(Object),
        false,
      )
    })

    it("uses cookie-auth temp-context options when Turnstile assistance runs for cookie-auth accounts", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile verify failed",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "need manual verification",
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "session=abc" },
        account_info: { ...mockAccount.account_info, access_token: "" },
        checkIn: {
          ...mockAccount.checkIn,
          customCheckIn: {
            turnstilePreTrigger: { kind: "selector", selector: "#checkin" },
          },
        },
      }

      await newApiProvider.checkIn(account)

      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          authType: AuthTypeEnum.Cookie,
          cookieAuthSessionCookie: "session=abc",
          turnstilePreTrigger: { kind: "selector", selector: "#checkin" },
          fetchOptions: expect.objectContaining({
            credentials: "include",
          }),
        }),
      )
      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          fetchOptions: expect.objectContaining({
            headers: expect.not.objectContaining({
              Authorization: expect.anything(),
            }),
          }),
        }),
      )
    })

    it("returns manual-required messaging with the site check-in URL when Turnstile token cannot be obtained", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
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

      const account = {
        ...mockAccount,
        checkIn: {
          ...mockAccount.checkIn,
          customCheckIn: { url: "https://test.com/custom-checkin" },
        },
      }

      const result = await newApiProvider.checkIn(account)

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
        "~/utils/browser/tempWindowFetch"
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

    it("returns manual-required when Turnstile assistance succeeds but still cannot obtain a usable token", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: false,
          message: "",
          data: null,
        },
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.turnstileManualRequired",
        messageParams: { checkInUrl: "https://test.com/console/personal" },
        rawMessage: "Turnstile token invalid",
        data: {
          success: false,
          message: "",
          data: null,
        },
      })
    })

    it("returns already-checked when assisted success payload still shows a non-token-obtained Turnstile status", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile verify failed",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: false,
          message: "manual confirmation",
          data: { checkin_date: "2026-01-01" },
        },
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "already_checked",
        messageKey: "autoCheckin:providerFallback.alreadyCheckedToday",
        data: {
          success: false,
          message: "manual confirmation",
          data: { checkin_date: "2026-01-01" },
        },
      })
    })

    it("surfaces the assisted backend failure when Turnstile replay returns a concrete rejection without widget status", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile verify failed",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: false,
          message: "daily quota exhausted",
          data: null,
        },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: "daily quota exhausted",
        messageKey: undefined,
        data: {
          success: false,
          message: "daily quota exhausted",
          data: null,
        },
      })
      expect(fetchApiData).not.toHaveBeenCalled()
    })

    it("falls back to the generic failure key when assisted replay returns no usable payload", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile verify failed",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: undefined,
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: undefined,
      })
      expect(fetchApiData).not.toHaveBeenCalled()
    })

    it("falls back to a generic failure when assisted Turnstile fetch fails after token capture without an explicit error", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        turnstile: { status: "token_obtained", hasTurnstile: true },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: "Turnstile token invalid",
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: {
          success: false,
          turnstile: { status: "token_obtained", hasTurnstile: true },
        },
      })
    })

    it("uses the assisted error directly when token capture succeeds but replay still fails", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "server rejected assisted replay",
        turnstile: { status: "token_obtained", hasTurnstile: true },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: "server rejected assisted replay",
        messageKey: undefined,
        data: {
          success: false,
          error: "server rejected assisted replay",
          turnstile: { status: "token_obtained", hasTurnstile: true },
        },
      })
    })

    it("retries in an incognito temp context when Turnstile widget is not present and checked_in_today is false", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      const { isAllowedIncognitoAccess } = await import(
        "~/utils/browser/browserApi"
      )

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

    it("falls back to manual verification when the incognito retry still cannot complete the assisted request", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )
      const { isAllowedIncognitoAccess } = await import(
        "~/utils/browser/browserApi"
      )

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
          success: false,
          error: "incognito replay failed",
          turnstile: { status: "error", hasTurnstile: true },
        })

      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(true)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.turnstileManualRequired",
        messageParams: { checkInUrl: "https://test.com/console/personal" },
        rawMessage: "Turnstile token not available",
        data: {
          success: false,
          error: "Turnstile token not available",
          turnstile: { status: "not_present", hasTurnstile: false },
        },
      })
    })

    it("prompts to enable incognito access when incognito retry is needed but extension is not allowed in incognito", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiService/common/utils"
      )
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )
      const { isAllowedIncognitoAccess } = await import(
        "~/utils/browser/browserApi"
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
        "~/utils/browser/tempWindowFetch"
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

    it("does not treat every Turnstile mention as a Turnstile-required failure", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile challenge rendered on page",
        data: { reason: "manual step still needed" },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: "Turnstile challenge rendered on page",
        messageKey: undefined,
        data: {
          success: false,
          message: "Turnstile challenge rendered on page",
          data: { reason: "manual step still needed" },
        },
      })
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("maps endpoint-style errors from the direct request to endpoint-not-supported", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")

      vi.mocked(fetchApi).mockRejectedValueOnce({
        statusCode: 404,
        message: "Not found",
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
    })

    it("returns a generic failed result when the Turnstile-assisted fetch cannot start", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })
      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce(null as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        rawMessage: "Turnstile token invalid",
        data: undefined,
      })
    })

    it("uses the generic failure key when the direct request fails without any upstream message", async () => {
      const { fetchApi } = await import("~/services/apiService/common/utils")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "",
        data: { details: "unknown failure" },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: {
          success: false,
          message: "",
          data: { details: "unknown failure" },
        },
      })
    })
  })
})
