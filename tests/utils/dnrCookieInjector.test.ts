import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants"
import {
  applyTempWindowCookieRule,
  buildTempWindowCookieRule,
  removeTempWindowCookieRule,
  TEMP_WINDOW_DNR_RULE_ID_BASE,
} from "~/utils/dnrCookieInjector"

vi.mock("~/utils/cookieHelper", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/utils/cookieHelper")>()
  return {
    ...original,
    getCookieHeaderForUrl: vi.fn().mockResolvedValue("session=abc"),
  }
})

describe("dnrCookieInjector", () => {
  let originalChrome: unknown

  beforeEach(() => {
    originalChrome = (globalThis as any).chrome
    vi.restoreAllMocks()
  })

  describe("runtimeMessages cookie import", () => {
    it("should respond with cookieHeader for cookie-auth import action", async () => {
      const originalBrowser = (globalThis as any).browser
      const listenerCalls: any[] = []

      const onMessage = {
        addListener: (cb: any) => listenerCalls.push(cb),
        removeListener: () => {},
      }

      ;(globalThis as any).browser = {
        runtime: {
          onMessage,
        },
      }

      try {
        const { setupRuntimeMessageListeners } = await import(
          "~/entrypoints/background/runtimeMessages"
        )

        setupRuntimeMessageListeners()
        expect(listenerCalls.length).toBeGreaterThan(0)
        const handler = listenerCalls[0]

        const responsePromise = new Promise<any>((resolve) => {
          handler(
            {
              action:
                RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
              url: "https://example.com",
            },
            {},
            (resp: any) => resolve(resp),
          )
        })

        const resp = await responsePromise
        expect(resp.success).toBe(true)
        expect(resp.cookieHeader).toBe("session=abc")

        const cookieHelper = await import("~/utils/cookieHelper")
        expect(cookieHelper.getCookieHeaderForUrl).toHaveBeenCalled()
      } finally {
        ;(globalThis as any).browser = originalBrowser
      }
    })
  })

  afterEach(() => {
    ;(globalThis as any).chrome = originalChrome
  })

  it("buildTempWindowCookieRule should create a per-tab rule with stable id and cookie header override", () => {
    const rule = buildTempWindowCookieRule({
      tabId: 123,
      url: "https://example.com/api/user/self",
      cookieHeader: "cf_clearance=abc; __cf_bm=def",
    })

    expect(rule.id).toBe(TEMP_WINDOW_DNR_RULE_ID_BASE + 123)
    expect(rule.action.type).toBe("modifyHeaders")

    const cookieOp = rule.action.requestHeaders?.find(
      (h) => h.header.toLowerCase() === "cookie",
    )
    expect(cookieOp).toBeTruthy()
    expect(cookieOp?.operation).toBe("set")
    if (cookieOp && cookieOp.operation === "set" && "value" in cookieOp) {
      expect(cookieOp.value).toContain("cf_clearance")
    }

    expect(rule.condition.tabIds).toEqual([123])
    expect(rule.condition.urlFilter).toBe("||example.com/")
  })

  it("applyTempWindowCookieRule should call updateSessionRules with remove+add", async () => {
    const updateSessionRules = vi.fn().mockResolvedValue(undefined)

    ;(globalThis as any).chrome = {
      declarativeNetRequest: { updateSessionRules },
    }

    const ruleId = await applyTempWindowCookieRule({
      tabId: 5,
      url: "https://example.com/api",
      cookieHeader: "cf_clearance=abc",
    })

    expect(ruleId).toBe(TEMP_WINDOW_DNR_RULE_ID_BASE + 5)
    expect(updateSessionRules).toHaveBeenCalledTimes(1)

    const call = updateSessionRules.mock.calls[0]?.[0]
    expect(call.removeRuleIds).toEqual([TEMP_WINDOW_DNR_RULE_ID_BASE + 5])
    expect(call.addRules?.[0]?.id).toBe(TEMP_WINDOW_DNR_RULE_ID_BASE + 5)
  })

  it("removeTempWindowCookieRule should call updateSessionRules with remove only", async () => {
    const updateSessionRules = vi.fn().mockResolvedValue(undefined)

    ;(globalThis as any).chrome = {
      declarativeNetRequest: { updateSessionRules },
    }

    await removeTempWindowCookieRule(42)

    expect(updateSessionRules).toHaveBeenCalledTimes(1)
    expect(updateSessionRules).toHaveBeenCalledWith({ removeRuleIds: [42] })
  })
})
