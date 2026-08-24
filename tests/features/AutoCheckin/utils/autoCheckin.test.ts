import { describe, expect, it, vi } from "vitest"

import {
  countAutoCheckinResults,
  FILTER_STATUS,
  filterAutoCheckinResults,
  getAutoCheckinResultMessage,
  isInvalidAccessTokenMessage,
  isNoTabWithIdMessage,
  resolveAutoCheckinTroubleshootingHintKey,
  translateAutoCheckinMessageKey,
} from "~/features/AutoCheckin/utils/autoCheckin"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

describe("autoCheckin utils", () => {
  it("counts already-checked outcomes as successful", () => {
    expect(
      countAutoCheckinResults([
        {
          accountId: "success",
          accountName: "Success",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1,
        },
        {
          accountId: "already-checked",
          accountName: "Already checked",
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          timestamp: 2,
        },
        {
          accountId: "failed",
          accountName: "Failed",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 3,
        },
        {
          accountId: "skipped",
          accountName: "Skipped",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          timestamp: 4,
        },
        {
          accountId: "uncertain",
          accountName: "Uncertain",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reconciliation: "unknown",
          timestamp: 5,
        },
      ]),
    ).toEqual({ total: 5, success: 2, failed: 2, skipped: 1 })
  })

  describe("translateAutoCheckinMessageKey", () => {
    it.each([
      "autoCheckin:providerFallback.alreadyCheckedToday",
      "autoCheckin:providerFallback.checkinSuccessful",
      "autoCheckin:providerFallback.checkinFailed",
      "autoCheckin:providerFallback.endpointNotSupported",
      "autoCheckin:providerFallback.nativePageIdentityMismatch",
      "autoCheckin:providerFallback.nativePageIdentityMissing",
      "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
      "autoCheckin:providerFallback.nativePageTargetNotFound",
      "autoCheckin:providerFallback.nativePageTriggerFailed",
      "autoCheckin:providerFallback.unknownError",
      "autoCheckin:providerFallback.turnstileManualRequired",
      "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
      "autoCheckin:providerWong.checkinDisabled",
      "autoCheckin:skipReasons.account_data_missing",
      "autoCheckin:skipReasons.account_disabled",
      "autoCheckin:skipReasons.authentication_required",
      "autoCheckin:skipReasons.credentials_missing",
      "autoCheckin:skipReasons.detection_disabled",
      "autoCheckin:skipReasons.method_disabled",
      "autoCheckin:skipReasons.method_not_matched",
      "autoCheckin:skipReasons.method_unavailable",
      "autoCheckin:skipReasons.method_unsupported",
      "autoCheckin:skipReasons.network_error",
      "autoCheckin:skipReasons.no_selected_method",
      "autoCheckin:skipReasons.permission_denied",
      "autoCheckin:skipReasons.source_unavailable",
      "autoCheckin:skipReasons.timeout",
      "autoCheckin:skipReasons.auto_checkin_disabled",
      "autoCheckin:skipReasons.already_checked_today",
      "autoCheckin:skipReasons.status_unavailable",
      "autoCheckin:skipReasons.no_provider",
      "autoCheckin:skipReasons.account_unavailable",
    ])("translates the known key %s", (messageKey) => {
      const t = vi.fn(
        (key: string, params?: Record<string, unknown>) =>
          `${key}:${String(params?.count ?? "")}`,
      )

      const result = translateAutoCheckinMessageKey(t as any, messageKey, {
        count: 2,
      })

      expect(result).toBe(`${messageKey}:2`)
      expect(t).toHaveBeenCalledWith(messageKey, { count: 2 })
    })

    it("returns unknown backend messages unchanged", () => {
      const t = vi.fn()

      expect(
        translateAutoCheckinMessageKey(
          t as any,
          "backend failure: upstream temporarily unavailable",
        ),
      ).toBe("backend failure: upstream temporarily unavailable")
      expect(t).not.toHaveBeenCalled()
    })
  })

  it("prefers controlled result reasons over backend copy", () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(
      getAutoCheckinResultMessage(t as any, {
        accountId: "account-1",
        accountName: "Account",
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: "authentication_required",
        rawMessage: "deployment-controlled copy",
        timestamp: 1,
      }),
    ).toBe("translated:autoCheckin:skipReasons.authentication_required")
  })

  it("uses the localized unknown fallback when a result has no message", () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(
      getAutoCheckinResultMessage(t as any, {
        accountId: "account-1",
        accountName: "Account",
        status: CHECKIN_RESULT_STATUS.FAILED,
        timestamp: 1,
      }),
    ).toBe("translated:autoCheckin:providerFallback.unknownError")
  })

  it("uses a localized pending-confirmation message for uncertain results", () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(
      getAutoCheckinResultMessage(t as any, {
        accountId: "account-1",
        accountName: "Account",
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reconciliation: "unknown",
        timestamp: 1,
      }),
    ).toBe("translated:autoCheckin:providerFallback.resultPendingConfirmation")
  })

  describe("isInvalidAccessTokenMessage", () => {
    it("returns false for blank messages", () => {
      expect(isInvalidAccessTokenMessage("")).toBe(false)
    })

    it("detects the strict chinese invalid-token snippet", () => {
      expect(isInvalidAccessTokenMessage("Access Token 无效，请重新登录")).toBe(
        true,
      )
    })

    it("detects english invalid or expired access-token hints", () => {
      expect(
        isInvalidAccessTokenMessage(
          "Your access token is invalid for this API",
        ),
      ).toBe(true)
      expect(
        isInvalidAccessTokenMessage(
          "The ACCESS TOKEN has expired, please retry",
        ),
      ).toBe(true)
    })

    it("requires an invalidity hint when only the access-token keyword appears", () => {
      expect(
        isInvalidAccessTokenMessage("access token accepted but quota exceeded"),
      ).toBe(false)
    })
  })

  describe("filterAutoCheckinResults", () => {
    it("matches trimmed keywords against the localized result message", () => {
      const t = vi.fn((key: string) =>
        key === "autoCheckin:skipReasons.status_unavailable"
          ? "暂时无法确认当前签到状态"
          : key,
      )

      expect(
        filterAutoCheckinResults(
          [
            {
              accountId: "account-1",
              accountName: "Example Account",
              status: CHECKIN_RESULT_STATUS.SKIPPED,
              reasonCode: "status_unavailable",
              timestamp: 1,
            },
          ],
          FILTER_STATUS.SKIPPED,
          "  无法确认  ",
          t as any,
        ),
      ).toHaveLength(1)
    })

    it("keeps uncertain results in the existing failure attention filters", () => {
      const results: CheckinAccountResult[] = [
        {
          accountId: "failed",
          accountName: "Failed",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 3,
        },
        {
          accountId: "skipped",
          accountName: "Skipped",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          timestamp: 2,
        },
        {
          accountId: "success",
          accountName: "Success",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1,
        },
        {
          accountId: "uncertain",
          accountName: "Uncertain",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reconciliation: "unknown",
          timestamp: 4,
        },
      ]

      expect(
        filterAutoCheckinResults(
          results,
          FILTER_STATUS.FAILED_OR_SKIPPED,
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["failed", "skipped", "uncertain"])

      expect(
        filterAutoCheckinResults(
          results,
          FILTER_STATUS.FAILED,
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["failed", "uncertain"])
    })
  })

  describe("isNoTabWithIdMessage", () => {
    it("returns false for blank messages", () => {
      expect(isNoTabWithIdMessage("")).toBe(false)
    })

    it.each([
      "No tab with id: 123",
      "no tab with id 42",
      "RuntimeError: No Tab With Id: 7",
    ])("detects the known closed-tab error shape: %s", (message) => {
      expect(isNoTabWithIdMessage(message)).toBe(true)
    })

    it("does not match unrelated tab errors", () => {
      expect(isNoTabWithIdMessage("tab closed unexpectedly")).toBe(false)
      expect(isNoTabWithIdMessage("no window with id: 3")).toBe(false)
    })
  })

  describe("resolveAutoCheckinTroubleshootingHintKey", () => {
    it("returns the site-type hint for skipped no-provider results", () => {
      expect(
        resolveAutoCheckinTroubleshootingHintKey({
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: "autoCheckin:skipReasons.no_provider",
          message: "账号所属站点类型暂不支持签到",
        }),
      ).toBe("execution.hints.siteTypeCheckinUnsupported")
    })

    it("returns the site-type hint for unsupported endpoint failures", () => {
      expect(
        resolveAutoCheckinTroubleshootingHintKey({
          status: CHECKIN_RESULT_STATUS.FAILED,
          messageKey: "autoCheckin:providerFallback.endpointNotSupported",
          message: "不支持该签到接口",
        }),
      ).toBe("execution.hints.siteTypeCheckinUnsupported")
    })

    it("still matches access-token hints for failed raw messages", () => {
      expect(
        resolveAutoCheckinTroubleshootingHintKey({
          status: CHECKIN_RESULT_STATUS.FAILED,
          message: "access token invalid",
        }),
      ).toBe("execution.hints.invalidAccessToken")
    })

    it.each([
      "Turnstile token not available",
      "Cloudflare Turnstile token is not available yet",
      "PoW challenge and nonce are required",
      "POW verification failed: challenge and nonce missing",
      "Turnstile校验失败，请刷新重试!",
      "Turnstile 验证失败，请刷新重试",
      "请打开网站后再签到",
      "请先打开站点完成验证后再签到",
    ])(
      "returns the manual verification hint for protected check-in failures: %s",
      (message) => {
        expect(
          resolveAutoCheckinTroubleshootingHintKey({
            status: CHECKIN_RESULT_STATUS.FAILED,
            message,
          }),
        ).toBe("execution.hints.manualVerificationRequired")
      },
    )

    it.each([
      "Turnstile configuration was rejected by the backend",
      "PoW verification failed",
      "请打开网站查看公告",
      "请稍后再签到",
    ])(
      "does not overmatch unrelated protected-flow messages: %s",
      (message) => {
        expect(
          resolveAutoCheckinTroubleshootingHintKey({
            status: CHECKIN_RESULT_STATUS.FAILED,
            message,
          }),
        ).toBeNull()
      },
    )

    it("does not return a raw-message hint for skipped rows without a known message key", () => {
      expect(
        resolveAutoCheckinTroubleshootingHintKey({
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          message: "签到跳过",
        }),
      ).toBeNull()
    })
  })
})
