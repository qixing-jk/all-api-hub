import { describe, expect, it, vi } from "vitest"

import {
  isInvalidAccessTokenMessage,
  isNoTabWithIdMessage,
  resolveAutoCheckinTroubleshootingHintKey,
  translateAutoCheckinMessageKey,
} from "~/features/AutoCheckin/utils/autoCheckin"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

describe("autoCheckin utils", () => {
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
      "autoCheckin:skipReasons.account_disabled",
      "autoCheckin:skipReasons.detection_disabled",
      "autoCheckin:skipReasons.auto_checkin_disabled",
      "autoCheckin:skipReasons.already_checked_today",
      "autoCheckin:skipReasons.no_provider",
      "autoCheckin:skipReasons.provider_not_ready",
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
