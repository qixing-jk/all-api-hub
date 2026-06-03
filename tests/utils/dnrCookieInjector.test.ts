import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  applyTempWindowCookieRule,
  buildTempWindowCookieRule,
  removeTempWindowCookieRule,
  TEMP_WINDOW_DNR_RULE_ID_BASE,
} from "~/utils/browser/dnrCookieInjector"

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}))

describe("dnrCookieInjector", () => {
  let originalChrome: unknown

  beforeEach(() => {
    originalChrome = (globalThis as any).chrome
    vi.restoreAllMocks()
    loggerWarnMock.mockReset()
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
    expect(rule.condition.regexFilter).toBe("^https://example\\.com/")
  })

  it("buildTempWindowCookieRule falls back to the base rule id when tab id is unavailable", () => {
    const rule = buildTempWindowCookieRule({
      tabId: Number.NaN as number,
      url: "https://example.com/api/user/self",
      cookieHeader: "cf_clearance=abc",
    })

    expect(rule.id).toBe(TEMP_WINDOW_DNR_RULE_ID_BASE)
    expect(rule.condition.regexFilter).toBe("^https://example\\.com/")
  })

  it("buildTempWindowCookieRule preserves URL ports in the DNR filter", () => {
    const rule = buildTempWindowCookieRule({
      tabId: 9,
      url: "http://127.0.0.1:3100/api/user/self",
      cookieHeader: "session=user-a",
    })

    expect(rule.condition.regexFilter).toBe("^http://127\\.0\\.0\\.1:3100/")
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

  it("applyTempWindowCookieRule returns null when no cookie header is available", async () => {
    const updateSessionRules = vi.fn().mockResolvedValue(undefined)

    ;(globalThis as any).chrome = {
      declarativeNetRequest: { updateSessionRules },
    }

    const ruleId = await applyTempWindowCookieRule({
      tabId: 5,
      url: "https://example.com/api",
      cookieHeader: "",
    })

    expect(ruleId).toBeNull()
    expect(updateSessionRules).not.toHaveBeenCalled()
  })

  it("applyTempWindowCookieRule returns null when the DNR API is unavailable", async () => {
    ;(globalThis as any).chrome = {}

    const ruleId = await applyTempWindowCookieRule({
      tabId: 5,
      url: "https://example.com/api",
      cookieHeader: "cf_clearance=abc",
    })

    expect(ruleId).toBeNull()
  })

  it("applyTempWindowCookieRule logs and returns null when session rule installation fails", async () => {
    const updateSessionRules = vi
      .fn()
      .mockRejectedValue(new Error("DNR backend unavailable"))

    ;(globalThis as any).chrome = {
      declarativeNetRequest: { updateSessionRules },
    }

    const ruleId = await applyTempWindowCookieRule({
      tabId: 5,
      url: "https://example.com/api",
      cookieHeader: "cf_clearance=abc",
    })

    expect(ruleId).toBeNull()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Failed to install temp-window cookie rule",
      expect.any(Error),
    )
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

  it("removeTempWindowCookieRule no-ops when the DNR API is unavailable", async () => {
    ;(globalThis as any).chrome = {}

    await expect(removeTempWindowCookieRule(42)).resolves.toBeUndefined()
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  it("removeTempWindowCookieRule logs cleanup failures without throwing", async () => {
    const updateSessionRules = vi
      .fn()
      .mockRejectedValue(new Error("cleanup failed"))

    ;(globalThis as any).chrome = {
      declarativeNetRequest: { updateSessionRules },
    }

    await expect(removeTempWindowCookieRule(42)).resolves.toBeUndefined()

    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Failed to remove temp-window cookie rule",
      expect.any(Error),
    )
  })
})
