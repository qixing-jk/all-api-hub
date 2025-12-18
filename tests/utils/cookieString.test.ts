import { describe, expect, it } from "vitest"

import { mergeCookieHeaders, parseCookieHeader, stringifyCookieHeader } from "~/utils/cookieString"

describe("cookieString", () => {
  it("parseCookieHeader should parse name/value pairs", () => {
    const map = parseCookieHeader("a=1; b=two;  c=3")
    expect(map.get("a")).toBe("1")
    expect(map.get("b")).toBe("two")
    expect(map.get("c")).toBe("3")
  })

  it("stringifyCookieHeader should serialize map", () => {
    const map = new Map([
      ["a", "1"],
      ["b", "two"],
    ])
    expect(stringifyCookieHeader(map)).toBe("a=1; b=two")
  })

  it("mergeCookieHeaders should prefer override values", () => {
    const merged = mergeCookieHeaders("a=1; b=2", "b=9; c=3")
    expect(merged).toBe("a=1; b=9; c=3")
  })

  it("mergeCookieHeaders should tolerate empty inputs", () => {
    expect(mergeCookieHeaders("", "a=1")).toBe("a=1")
    expect(mergeCookieHeaders("a=1", "")).toBe("a=1")
  })
})
