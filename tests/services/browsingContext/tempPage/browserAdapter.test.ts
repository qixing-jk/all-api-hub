import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getTempContextTabSnapshot,
  isTempContextContentReady,
  navigateTempContextToPage,
  prepareTempContextFetchOptions,
  removeInstalledDownloadBlockRules,
  resolveTempContextPreferenceMode,
  showShieldBypassUiInTab,
  waitForTabComplete,
} from "~/services/browsingContext/tempPage/browserAdapter"
import { checkTempContextProtectionGuards } from "~/services/browsingContext/tempPage/tempContextProtectionGuards"
import { resolveTempWindowSize } from "~/services/browsingContext/tempPage/windowSize"
import { userPreferences } from "~/services/preferences/userPreferences"
import { AuthTypeEnum } from "~/types"
import * as cookieHelper from "~/utils/browser/cookieHelper"
import * as dnrCookieInjector from "~/utils/browser/dnrCookieInjector"
import * as firefoxBlocker from "~/utils/browser/firefoxTempWindowDownloadBlocker"
import * as protectionBypass from "~/utils/browser/protectionBypass"
import * as browserApi_runtimeMessages from "~/utils/browser/runtimeMessages"
import * as browserApi_tabs from "~/utils/browser/tabs"

vi.mock(
  "~/services/browsingContext/tempPage/tempContextProtectionGuards",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/browsingContext/tempPage/tempContextProtectionGuards")
    >()),
    checkTempContextProtectionGuards: vi.fn().mockResolvedValue({
      passed: true,
      verificationRequired: false,
      capPassed: true,
      cloudflarePassed: true,
      aliyunPassed: true,
    }),
  }),
)

describe("browserAdapter", () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(protectionBypass, "isProtectionBypassFirefoxEnv").mockReturnValue(
      false,
    )
  })

  it.each(["cap", "cloudflare", "aliyun"] as const)(
    "does not reuse a tab whose %s receiver is unavailable",
    async (missing) => {
      vi.mocked(checkTempContextProtectionGuards).mockResolvedValueOnce({
        passed: true,
        verificationRequired: false,
        capPassed: true,
        cloudflarePassed: true,
        aliyunPassed: true,
        cap: { success: true },
        cloudflare: { success: true },
        aliyun: { success: true },
        [missing]: { success: false },
      })
      await expect(
        isTempContextContentReady(1, {
          requestId: "ready",
          origin: "https://gateway.example",
        }),
      ).resolves.toBe(false)
    },
  )

  it("reuses a tab when every protection receiver responds and passes", async () => {
    vi.mocked(checkTempContextProtectionGuards).mockResolvedValueOnce({
      passed: true,
      verificationRequired: false,
      capPassed: true,
      cloudflarePassed: true,
      aliyunPassed: true,
      cap: { success: true },
      cloudflare: { success: true },
      aliyun: { success: true },
    })
    await expect(
      isTempContextContentReady(1, {
        requestId: "ready",
        origin: "https://gateway.example",
      }),
    ).resolves.toBe(true)
  })

  it("holds page readiness until the Aliyun challenge clears", async () => {
    vi.useFakeTimers()
    vi.spyOn(browserApi_tabs, "getTab").mockResolvedValue({
      status: "complete",
    } as any)
    vi.mocked(checkTempContextProtectionGuards).mockResolvedValueOnce({
      passed: false,
      verificationRequired: true,
      capPassed: true,
      cloudflarePassed: true,
      aliyunPassed: false,
    })
    const ready = vi.fn()
    const waiting = waitForTabComplete(1).then(ready)
    await vi.advanceTimersByTimeAsync(500)
    expect(ready).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    await waiting
    expect(ready).toHaveBeenCalledOnce()
  })

  it("reports a bounded protection timeout separately from page loading", async () => {
    vi.useFakeTimers()
    vi.spyOn(browserApi_tabs, "getTab").mockResolvedValue({
      status: "complete",
    } as any)
    vi.mocked(checkTempContextProtectionGuards).mockResolvedValue({
      passed: false,
      verificationRequired: true,
      capPassed: true,
      cloudflarePassed: true,
      aliyunPassed: false,
    })
    const result = expect(waitForTabComplete(1)).rejects.toMatchObject({
      name: "ProtectionPageTimeoutError",
    })
    await vi.advanceTimersByTimeAsync(20_000)
    await result
    vi.mocked(checkTempContextProtectionGuards).mockResolvedValue({
      passed: true,
      verificationRequired: false,
      capPassed: true,
      cloudflarePassed: true,
      aliyunPassed: true,
    })
  })

  describe("removeInstalledDownloadBlockRules", () => {
    it("calls rule removal functions when IDs are provided", async () => {
      const removeDnrSpy = vi
        .spyOn(dnrCookieInjector, "removeTempWindowDownloadBlockRule")
        .mockResolvedValue(undefined)
      const removeFfSpy = vi
        .spyOn(firefoxBlocker, "removeFirefoxTempWindowDownloadBlockRule")
        .mockResolvedValue(undefined)

      await removeInstalledDownloadBlockRules(123, 456)

      expect(removeDnrSpy).toHaveBeenCalledWith(123)
      expect(removeFfSpy).toHaveBeenCalledWith(456)
    })

    it("skips removal when IDs are null or undefined", async () => {
      const removeDnrSpy = vi
        .spyOn(dnrCookieInjector, "removeTempWindowDownloadBlockRule")
        .mockResolvedValue(undefined)
      const removeFfSpy = vi
        .spyOn(firefoxBlocker, "removeFirefoxTempWindowDownloadBlockRule")
        .mockResolvedValue(undefined)

      await removeInstalledDownloadBlockRules(null, undefined)

      expect(removeDnrSpy).not.toHaveBeenCalled()
      expect(removeFfSpy).not.toHaveBeenCalled()
    })
  })

  describe("resolveTempContextPreferenceMode and resolveTempWindowSize", () => {
    it("resolves preferred mode from userPreferences", async () => {
      vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
        tempWindowFallback: { tempContextMode: "window" },
      } as any)

      expect(await resolveTempContextPreferenceMode()).toBe("window")
    })

    it("falls back to default mode when preferences reject or are empty", async () => {
      vi.spyOn(userPreferences, "getPreferences").mockRejectedValue(
        new Error("Storage error"),
      )

      expect(await resolveTempContextPreferenceMode()).toBe("auto")
    })

    it("resolves temp window size from preferences", async () => {
      vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
        tempWindowFallback: { windowWidth: 1024, windowHeight: 768 },
      } as any)

      const size = await resolveTempWindowSize()
      expect(size.width).toBe(1024)
      expect(size.height).toBe(768)
    })

    it("handles failure when getting preferences for window size", async () => {
      vi.spyOn(userPreferences, "getPreferences").mockRejectedValue(
        new Error("Storage fail"),
      )

      const size = await resolveTempWindowSize()
      expect(typeof size.width).toBe("number")
      expect(typeof size.height).toBe("number")
    })
  })

  describe("getTempContextTabSnapshot", () => {
    it("returns tab url and status when getTab succeeds", async () => {
      vi.spyOn(browserApi_tabs, "getTab").mockResolvedValue({
        id: 1,
        url: "https://example.com/page",
        status: "complete",
      } as any)

      const snapshot = await getTempContextTabSnapshot(1)
      expect(snapshot).toEqual({
        url: "https://example.com/page",
        status: "complete",
      })
    })

    it("returns null when getTab throws", async () => {
      vi.spyOn(browserApi_tabs, "getTab").mockRejectedValue(
        new Error("Tab closed"),
      )

      const snapshot = await getTempContextTabSnapshot(999)
      expect(snapshot).toBeNull()
    })
  })

  describe("navigateTempContextToPage", () => {
    it("returns immediately if current tab already at destination and complete", async () => {
      vi.spyOn(browserApi_tabs, "getTab").mockResolvedValue({
        id: 10,
        url: "https://example.com/dest",
        status: "complete",
      } as any)
      const updateTabSpy = vi.spyOn(browserApi_tabs, "updateTab")

      const context: any = { tabId: 10, currentUrl: "https://example.com/dest" }
      await navigateTempContextToPage(context, "https://example.com/dest", {
        requestId: "req-nav-1",
        origin: "https://example.com",
      })

      expect(updateTabSpy).not.toHaveBeenCalled()
    })

    it("throws if signal is already aborted", async () => {
      const controller = new AbortController()
      controller.abort()

      const context: any = { tabId: 10, currentUrl: "https://example.com" }
      await expect(
        navigateTempContextToPage(context, "https://example.com/new", {
          requestId: "req-nav-2",
          origin: "https://example.com",
          signal: controller.signal,
        }),
      ).rejects.toThrow()
    })
  })

  describe("prepareTempContextFetchOptions", () => {
    it("installs one combined Cookie rule instead of a preliminary WAF rule for an explicit session", async () => {
      vi.spyOn(cookieHelper, "getCookieHeaderForUrl").mockResolvedValue(
        "acw_sc__v2=clearance",
      )
      const inject = vi
        .spyOn(dnrCookieInjector, "applyTempWindowCookieRule")
        .mockResolvedValue(1001)
      const result = await prepareTempContextFetchOptions({
        tabId: 5,
        url: "https://anyrouter.top/api/user/self",
        rawOptions: { credentials: "omit" },
        resolvedAuthType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=draft",
      })
      expect(inject).toHaveBeenCalledExactlyOnceWith({
        tabId: 5,
        url: "https://anyrouter.top/api/user/self",
        cookieHeader: "acw_sc__v2=clearance; session=draft",
      })
      expect(result.ruleIds).toEqual([1001])
    })
    it("refuses to borrow the browser login when the supplied session cannot be injected", async () => {
      vi.spyOn(cookieHelper, "getCookieHeaderForUrl").mockResolvedValue(
        "acw_sc__v2=clearance",
      )
      vi.spyOn(
        dnrCookieInjector,
        "applyTempWindowCookieRule",
      ).mockResolvedValue(null)
      await expect(
        prepareTempContextFetchOptions({
          tabId: 5,
          url: "https://anyrouter.top/api/user/self",
          rawOptions: { credentials: "include" },
          resolvedAuthType: AuthTypeEnum.Cookie,
          cookieAuthSessionCookie: "session=draft",
        }),
      ).rejects.toMatchObject({ code: "COOKIE_REQUEST_UNAVAILABLE" })
    })
    it("injects WAF cookies in chromium for credentials=omit", async () => {
      vi.spyOn(
        protectionBypass,
        "isProtectionBypassFirefoxEnv",
      ).mockReturnValue(false)
      vi.spyOn(cookieHelper, "getCookieHeaderForUrl").mockResolvedValue(
        "cf_clearance=abc",
      )
      vi.spyOn(
        dnrCookieInjector,
        "applyTempWindowCookieRule",
      ).mockResolvedValue(1001)

      const result = await prepareTempContextFetchOptions({
        tabId: 5,
        url: "https://example.com/api",
        rawOptions: { credentials: "omit" },
      })

      expect(result.ruleIds).toContain(1001)
      expect(result.effectiveFetchOptions.credentials).toBe("include")
    })

    it("handles cookie auth in Firefox env with custom header", async () => {
      vi.spyOn(
        protectionBypass,
        "isProtectionBypassFirefoxEnv",
      ).mockReturnValue(true)
      vi.spyOn(cookieHelper, "getCookieHeaderForUrl").mockResolvedValue(
        "waf=123",
      )

      const result = await prepareTempContextFetchOptions({
        tabId: 6,
        url: "https://example.com/api",
        rawOptions: { headers: {} },
        resolvedAuthType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=xyz",
        addFirefoxAuthModeHeader: true,
      })

      expect(result.effectiveFetchOptions.credentials).toBe("include")
      expect(
        (result.effectiveFetchOptions.headers as any)[
          cookieHelper.COOKIE_SESSION_OVERRIDE_HEADER_NAME.toLowerCase()
        ],
      ).toBe("session=xyz")
    })
  })

  describe("showShieldBypassUiInTab", () => {
    it("sends message to content script successfully", async () => {
      const sendTabMessageSpy = vi
        .spyOn(browserApi_runtimeMessages, "sendTabMessageWithRetry")
        .mockResolvedValue({} as any)

      await showShieldBypassUiInTab({
        tabId: 42,
        origin: "https://example.com",
        requestId: "req-shield-1",
      })

      expect(sendTabMessageSpy).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          origin: "https://example.com",
          requestId: "req-shield-1",
        }),
        expect.any(Object),
      )
    })
  })

  describe("waitForTabComplete", () => {
    it("resolves when tab completes and guards pass", async () => {
      vi.spyOn(browserApi_tabs, "getTab").mockResolvedValue({
        id: 7,
        status: "complete",
      } as any)

      await expect(
        waitForTabComplete(7, {
          requestId: "req-wait-1",
          origin: "https://example.com",
        }),
      ).resolves.toBeUndefined()
    })

    it("rejects immediately when aborted signal is provided", async () => {
      const controller = new AbortController()
      controller.abort()

      await expect(
        waitForTabComplete(8, {
          requestId: "req-wait-2",
          origin: "https://example.com",
          signal: controller.signal,
        }),
      ).rejects.toThrow("Temporary page cancelled")
    })

    it("rejects when getTab throws", async () => {
      vi.spyOn(browserApi_tabs, "getTab").mockRejectedValue(
        new Error("Tab destroyed"),
      )

      await expect(
        waitForTabComplete(9, {
          requestId: "req-wait-3",
          origin: "https://example.com",
        }),
      ).rejects.toThrow("Tab destroyed")
    })
  })
})
