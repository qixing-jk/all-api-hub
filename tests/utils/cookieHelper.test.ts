import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  COOKIE_HEADER_READ_FAILURE_REASONS,
  getCookieHeaderForUrl,
  getCookieHeaderForUrlResult,
  hasCookieReadPermissionForUrl,
} from "~/utils/browser/cookieHelper"

describe("cookieHelper", () => {
  beforeEach(() => {
    const globalAny = globalThis as any
    globalAny.browser ??= {}
    globalAny.browser.cookies = {
      getAll: vi.fn(),
    }
    globalAny.browser.permissions = {
      contains: vi.fn().mockResolvedValue(true),
    }
  })

  it("formats cookie header from browser.cookies.getAll", async () => {
    const getAll = vi
      .fn()
      .mockResolvedValue([
        { name: "a", value: "1" } as any,
        { name: "b", value: "2" } as any,
      ])
    ;(globalThis as any).browser.cookies.getAll = getAll

    const header = await getCookieHeaderForUrl("https://example.com")

    expect(header).toBe("a=1; b=2")
    expect(getAll).toHaveBeenCalledWith({
      url: "https://example.com",
      partitionKey: {},
    })
  })

  it("filters out expired cookies", async () => {
    const getAll = vi.fn().mockResolvedValue([
      {
        name: "expired",
        value: "1",
        expirationDate: Date.now() / 1000 - 10,
      } as any,
      {
        name: "valid",
        value: "2",
        expirationDate: Date.now() / 1000 + 10,
      } as any,
    ])
    ;(globalThis as any).browser.cookies.getAll = getAll

    const header = await getCookieHeaderForUrl("https://example.com")

    expect(header).toBe("valid=2")
  })

  it("excludes the session cookie when includeSession is false", async () => {
    const getAll = vi
      .fn()
      .mockResolvedValue([
        { name: "session", value: "abc" } as any,
        { name: "cf_clearance", value: "def" } as any,
      ])
    ;(globalThis as any).browser.cookies.getAll = getAll

    const header = await getCookieHeaderForUrl("https://example.com", {
      includeSession: false,
    })

    expect(header).toBe("cf_clearance=def")
  })

  it("returns an empty string when cookies.getAll fails", async () => {
    const getAll = vi.fn().mockRejectedValue(new Error("boom"))
    ;(globalThis as any).browser.cookies.getAll = getAll

    await expect(getCookieHeaderForUrl("https://example.com")).resolves.toBe("")
  })

  it("reports permission-denied failures when cookie access is not granted", async () => {
    const getAll = vi
      .fn()
      .mockRejectedValue(new Error("Missing host permission for the tab"))
    ;(globalThis as any).browser.cookies.getAll = getAll

    await expect(
      getCookieHeaderForUrlResult("https://example.com"),
    ).resolves.toMatchObject({
      header: "",
      failureReason: COOKIE_HEADER_READ_FAILURE_REASONS.PermissionDenied,
      errorMessage: "Missing host permission for the tab",
    })
  })

  it("reports read-failed for non-permission cookie read errors", async () => {
    const getAll = vi
      .fn()
      .mockRejectedValue(new Error("storage backend failed"))
    ;(globalThis as any).browser.cookies.getAll = getAll

    await expect(
      getCookieHeaderForUrlResult("https://example.com"),
    ).resolves.toMatchObject({
      header: "",
      failureReason: COOKIE_HEADER_READ_FAILURE_REASONS.ReadFailed,
      errorMessage: "storage backend failed",
    })
  })

  it("checks both cookies permission and target origin before cookie reads", async () => {
    const contains = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).browser.permissions.contains = contains

    await expect(
      hasCookieReadPermissionForUrl("https://example.com/path?foo=bar"),
    ).resolves.toBe(true)

    expect(contains).toHaveBeenCalledWith({
      permissions: ["cookies"],
      origins: ["https://example.com/*"],
    })
  })

  it("does not cache cookie values between calls", async () => {
    const getAll = vi
      .fn()
      .mockResolvedValueOnce([{ name: "a", value: "1" } as any])
      .mockResolvedValueOnce([{ name: "a", value: "2" } as any])
    ;(globalThis as any).browser.cookies.getAll = getAll

    await expect(getCookieHeaderForUrl("https://example.com")).resolves.toBe(
      "a=1",
    )
    await expect(getCookieHeaderForUrl("https://example.com")).resolves.toBe(
      "a=2",
    )
    expect(getAll).toHaveBeenCalledTimes(2)
  })
})
