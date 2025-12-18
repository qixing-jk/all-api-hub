import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  applyTempWindowCookieRule,
  buildTempWindowCookieRule,
  removeTempWindowCookieRule,
  TEMP_WINDOW_DNR_RULE_ID_BASE,
} from "~/utils/dnrCookieInjector"

describe("dnrCookieInjector", () => {
  let originalChrome: unknown

  beforeEach(() => {
    originalChrome = (globalThis as any).chrome
    vi.restoreAllMocks()
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
