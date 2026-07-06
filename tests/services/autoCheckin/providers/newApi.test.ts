import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { SITE_ROUTE_KINDS } from "~/services/accounts/utils/siteRouteResolver"
import { ApiError } from "~/services/apiTransport/errors"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { safeRandomUUID } from "~/utils/core/identifier"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiTransport/request", () => ({
  fetchApi: vi.fn(),
  fetchApiData: vi.fn(),
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  tempWindowTriggerCheckinPageAction: vi.fn(),
  tempWindowTurnstileFetch: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return { ...actual, isAllowedIncognitoAccess: vi.fn() }
})

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: vi.fn(),
}))

vi.mock("~/services/accounts/utils/siteRouteResolver", () => ({
  SITE_ROUTE_KINDS: {
    CheckIn: "checkIn",
  },
  resolveAccountSiteRouteUrl: vi.fn(() =>
    Promise.resolve("https://test.com/console/personal"),
  ),
}))

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
    id: "123",
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
    vi.mocked(safeRandomUUID).mockImplementation((prefix?: string) =>
      prefix ? `${prefix}-mock-uuid` : "mock-uuid",
    )
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
        account_info: { ...mockAccount.account_info, id: "" },
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
    it("uses native page check-in for narrow dynamic signature failures", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiTransport/request"
      )
      const { tempWindowTriggerCheckinPageAction, tempWindowTurnstileFetch } =
        await import("~/utils/browser/tempWindowFetch")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
        trigger: {
          status: "clicked",
          clicked: true,
          reason: "clicked",
          detection: {
            hasTurnstile: false,
            reasons: [],
            score: 0,
            title: "Check in",
            url: "https://test.com/console/personal",
          },
        },
      })
      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "already_checked",
        messageKey: "autoCheckin:providerFallback.alreadyCheckedToday",
        data: expect.objectContaining({
          reason: "clicked",
        }),
      })
      expect(vi.mocked(fetchApi).mock.calls[0]?.[0]).toMatchObject({
        accountId: "test-id",
      })
      expect(vi.mocked(fetchApiData).mock.calls[0]?.[0]).toMatchObject({
        accountId: "test-id",
      })
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          originUrl: "https://test.com",
          pageUrl: "https://test.com/console/personal",
          siteType: SITE_TYPES.NEW_API,
          expectedUserId: "123",
          accountId: "test-id",
          authType: AuthTypeEnum.AccessToken,
          trigger: { kind: "checkinButton" },
        }),
      )
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("uses native page check-in for generic check-in API failures", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiTransport/request"
      )
      const { tempWindowTriggerCheckinPageAction, tempWindowTurnstileFetch } =
        await import("~/utils/browser/tempWindowFetch")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "server rejected the check-in request",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
      })
      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledTimes(1)
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("does not treat unrelated authority errors as auth blocks for native fallback", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiTransport/request"
      )
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "upstream authority rejected the dynamic signature",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
      })
      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledTimes(1)
    })

    it("keeps native page action request ids scoped to each provider attempt", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiTransport/request"
      )
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(safeRandomUUID)
        .mockReturnValueOnce("native-checkin-test-id-first")
        .mockReturnValueOnce("native-checkin-test-id-second")
      vi.mocked(fetchApi).mockResolvedValue({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
      })
      vi.mocked(fetchApiData).mockResolvedValue({
        stats: { checked_in_today: true },
      } as any)

      await newApiProvider.checkIn(mockAccount)
      await newApiProvider.checkIn(mockAccount)

      const requestIds = vi
        .mocked(tempWindowTriggerCheckinPageAction)
        .mock.calls.map(([params]) => params.requestId)

      expect(safeRandomUUID).toHaveBeenCalledWith("native-checkin-test-id")
      expect(requestIds).toEqual([
        "native-checkin-test-id-first",
        "native-checkin-test-id-second",
      ])
    })

    it.each([
      "check-in endpoint unsupported",
      "unauthorized check-in request",
      "authentication required for check-in",
      "authenticate before check-in",
      "permission denied for check-in",
      "rate limit exceeded for check-in",
      "too many requests for check-in",
    ])(
      "does not use native page check-in for blocked failure message: %s",
      async (message) => {
        const { fetchApi } = await import("~/services/apiTransport/request")
        const { tempWindowTriggerCheckinPageAction, tempWindowTurnstileFetch } =
          await import("~/utils/browser/tempWindowFetch")

        vi.mocked(fetchApi).mockResolvedValueOnce({
          success: false,
          message,
          data: null,
        })

        const result = await newApiProvider.checkIn(mockAccount)

        expect(result).toEqual({
          status: "failed",
          rawMessage: message,
          messageKey: undefined,
          data: {
            success: false,
            message,
            data: null,
          },
        })
        expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
        expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
      },
    )

    it("does not use native page check-in when the API endpoint rejects POST with 405", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction, tempWindowTurnstileFetch } =
        await import("~/utils/browser/tempWindowFetch")

      const error = new ApiError("请求失败: 405", 405, "/api/user/checkin")

      vi.mocked(fetchApi).mockRejectedValueOnce(error)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: "请求失败: 405",
        messageKey: undefined,
      })
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("refuses native page check-in when temp page identity is missing", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "identity_missing",
        identity: null,
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.nativePageIdentityMissing",
        messageParams: { checkInUrl: "https://test.com/console/personal" },
        data: { success: false, reason: "identity_missing", identity: null },
      })
    })

    it("refuses native page check-in when temp page identity does not match", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "identity_mismatch",
        identity: { userId: "456", user: { id: "456" } },
        expectedUserId: "123",
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.nativePageIdentityMismatch",
        messageParams: { checkInUrl: "https://test.com/console/personal" },
        data: expect.objectContaining({
          reason: "identity_mismatch",
          expectedUserId: "123",
        }),
      })
    })

    it("returns manual-required messaging when native page trigger target is missing", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "target_not_found",
        identity: { userId: "123", user: { id: "123" } },
        trigger: {
          status: "target_not_found",
          clicked: false,
          reason: "noTarget",
          detection: {
            hasTurnstile: false,
            reasons: [],
            score: 0,
            title: "Check in",
            url: "https://test.com/console/personal",
          },
        },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.nativePageTargetNotFound",
      )
      expect(result.messageParams).toEqual({
        checkInUrl: "https://test.com/console/personal",
      })
      expect(result.rawMessage).toBeUndefined()
    })

    it("maps throttled native page actions to trigger failure messaging", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "throttled",
        error: "native action recently attempted",
        identity: { userId: "123", user: { id: "123" } },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.nativePageTriggerFailed",
      )
      expect(result.messageParams).toEqual({
        checkInUrl: "https://test.com/console/personal",
      })
      expect(result.rawMessage).toBe("native action recently attempted")
      expect(result.rawMessage).not.toBe("missing check-in signature header")
    })

    it("returns native trigger failure messaging when native page action rejects after response signature failure", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockRejectedValueOnce(
        new Error("temp window closed"),
      )

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.nativePageTriggerFailed",
        messageParams: { checkInUrl: "https://test.com/console/personal" },
        rawMessage: "temp window closed",
      })
    })

    it("returns manual-required messaging when native click is not confirmed by status polling", async () => {
      vi.useFakeTimers()

      try {
        const { fetchApi, fetchApiData } = await import(
          "~/services/apiTransport/request"
        )
        const { tempWindowTriggerCheckinPageAction } = await import(
          "~/utils/browser/tempWindowFetch"
        )

        vi.mocked(fetchApi).mockResolvedValueOnce({
          success: false,
          message: "missing check-in signature header",
          data: null,
        })
        vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
          success: true,
          reason: "clicked",
          identity: { userId: "123", user: { id: "123" } },
          trigger: {
            status: "clicked",
            clicked: true,
            reason: "clicked",
            detection: {
              hasTurnstile: false,
              reasons: [],
              score: 0,
              title: "Check in",
              url: "https://test.com/console/personal",
            },
          },
        })
        vi.mocked(fetchApiData).mockResolvedValue({
          stats: { checked_in_today: false },
        } as any)

        const resultPromise = newApiProvider.checkIn(mockAccount)
        await vi.advanceTimersByTimeAsync(9_000)
        const result = await resultPromise

        expect(result.status).toBe("failed")
        expect(result.messageKey).toBe(
          "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
        )
        expect(result.messageParams).toEqual({
          checkInUrl: "https://test.com/console/personal",
        })
        expect(result.rawMessage).toBeUndefined()
      } finally {
        vi.useRealTimers()
      }
    })

    it("does not add native page identity matching to Turnstile replay failures", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction, tempWindowTurnstileFetch } =
        await import("~/utils/browser/tempWindowFetch")
      const { isAllowedIncognitoAccess } = await import(
        "~/utils/browser/browserApi"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)
      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
    })

    it("uses native page check-in for thrown dynamic signature errors", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiTransport/request"
      )
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockRejectedValueOnce(
        new Error("missing check-in signature header"),
      )
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
      })
      vi.mocked(fetchApiData).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      } as any)

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledTimes(1)
    })

    it("returns native trigger failure messaging when native page action rejects after thrown signature error", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction } = await import(
        "~/utils/browser/tempWindowFetch"
      )

      vi.mocked(fetchApi).mockRejectedValueOnce(
        new Error("missing check-in signature header"),
      )
      vi.mocked(tempWindowTriggerCheckinPageAction).mockRejectedValueOnce(
        new Error("native page unavailable"),
      )

      await expect(newApiProvider.checkIn(mockAccount)).resolves.toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.nativePageTriggerFailed",
        messageParams: { checkInUrl: "https://test.com/console/personal" },
        rawMessage: "native page unavailable",
      })
    })

    it("returns the default success message key when the upstream check-in succeeds without a message", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")

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
      const { fetchApi } = await import("~/services/apiTransport/request")

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

    it("uses an incognito Turnstile temp context first for access-token accounts", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
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
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(true)

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
          useIncognito: true,
          turnstileTimeoutMs: 12000,
          turnstilePreTrigger: { kind: "checkinButton" },
        }),
      )
    })

    it("uses the theme-aware New API route for Turnstile-assisted verification pages", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTurnstileFetch } = await import(
        "~/utils/browser/tempWindowFetch"
      )
      const { isAllowedIncognitoAccess } = await import(
        "~/utils/browser/browserApi"
      )
      const { resolveAccountSiteRouteUrl } = await import(
        "~/services/accounts/utils/siteRouteResolver"
      )

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)
      vi.mocked(resolveAccountSiteRouteUrl).mockResolvedValueOnce(
        "https://test.com/profile",
      )
      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "need manual verification",
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      await newApiProvider.checkIn(mockAccount)

      expect(resolveAccountSiteRouteUrl).toHaveBeenCalledWith(
        {
          baseUrl: "https://test.com",
          siteType: SITE_TYPES.NEW_API,
        },
        SITE_ROUTE_KINDS.CheckIn,
      )
      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          pageUrl: "https://test.com/profile",
        }),
      )
    })

    it("falls back to normal Turnstile temp context when access-token incognito access is unavailable", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
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
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)
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

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("success")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.not.objectContaining({ useIncognito: true }),
      )
    })

    it("defaults missing authType to AccessToken for direct check-in requests", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")

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
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { fetchApiData } = await import("~/services/apiTransport/request")
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
            turnstilePreTrigger: {
              kind: "clickSelector" as const,
              selector: "#checkin",
            },
          },
        },
      }

      await newApiProvider.checkIn(account)

      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          authType: AuthTypeEnum.Cookie,
          cookieAuthSessionCookie: "session=abc",
          turnstilePreTrigger: {
            kind: "clickSelector",
            selector: "#checkin",
          },
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
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { fetchApiData } = await import("~/services/apiTransport/request")
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
        "~/services/apiTransport/request"
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
        "~/services/apiTransport/request"
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
        "~/services/apiTransport/request"
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
        "~/services/apiTransport/request"
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
        "~/services/apiTransport/request"
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
      const { fetchApi } = await import("~/services/apiTransport/request")
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
      const { fetchApi } = await import("~/services/apiTransport/request")
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

    it("falls back to the normal temp context when an incognito-first Turnstile attempt cannot obtain a token", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiTransport/request"
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
        1,
        expect.objectContaining({ useIncognito: true }),
      )
      expect(tempWindowTurnstileFetch).toHaveBeenNthCalledWith(
        2,
        expect.not.objectContaining({ useIncognito: true }),
      )
    })

    it("falls back to manual verification when the incognito retry still cannot complete the assisted request", async () => {
      const { fetchApi, fetchApiData } = await import(
        "~/services/apiTransport/request"
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
        "~/services/apiTransport/request"
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
      const { fetchApi } = await import("~/services/apiTransport/request")
      const { tempWindowTriggerCheckinPageAction, tempWindowTurnstileFetch } =
        await import("~/utils/browser/tempWindowFetch")

      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        message: "Something went wrong",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "target_not_found",
        identity: { userId: "123", user: { id: "123" } },
      })

      const result = await newApiProvider.checkIn(mockAccount)

      expect(result.status).toBe("failed")
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledTimes(1)
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("does not treat every Turnstile mention as a Turnstile-required failure", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
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
      const { fetchApi } = await import("~/services/apiTransport/request")

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
      const { fetchApi } = await import("~/services/apiTransport/request")
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
      const { fetchApi } = await import("~/services/apiTransport/request")

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
