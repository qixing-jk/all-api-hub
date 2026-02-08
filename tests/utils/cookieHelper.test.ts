import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCookieHeaderForUrl } from "~/utils/cookieHelper"

describe("cookieHelper", () => {
  beforeEach(() => {
    const globalAny = globalThis as any
    globalAny.browser ??= {}
    globalAny.browser.cookies = {
      getAll: vi.fn(),
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
