import { describe, expect, it } from "vitest"

import {
  extractSessionCookieHeader,
  normalizeCookieHeaderValue,
  parseCookieHeader,
} from "~/utils/cookieString"

describe("cookieString", () => {
  describe("normalizeCookieHeaderValue", () => {
    it("strips a leading Cookie: prefix", () => {
      expect(normalizeCookieHeaderValue("Cookie: a=1; b=2")).toBe("a=1; b=2")
      expect(normalizeCookieHeaderValue("cookie: a=1")).toBe("a=1")
      expect(normalizeCookieHeaderValue("  COOKIE :   a=1  ")).toBe("a=1")
    })
  })

  describe("parseCookieHeader", () => {
    it("parses Cookie: prefixed values", () => {
      const map = parseCookieHeader("Cookie: a=1; b=2")
      expect(map.get("a")).toBe("1")
      expect(map.get("b")).toBe("2")
    })
  })

  describe("extractSessionCookieHeader", () => {
    it("returns only the session cookie when present", () => {
      expect(extractSessionCookieHeader("session=abc; foo=1")).toBe(
        "session=abc",
      )
      expect(extractSessionCookieHeader("foo=1; session=abc")).toBe(
        "session=abc",
      )
    })

    it("handles Cookie: prefixed values", () => {
      expect(extractSessionCookieHeader("Cookie: session=abc; foo=1")).toBe(
        "session=abc",
      )
    })

    it("falls back to the normalized header when session is missing", () => {
      expect(extractSessionCookieHeader("foo=1; bar=2")).toBe("foo=1; bar=2")
    })

    it("matches session cookie name case-insensitively", () => {
      expect(extractSessionCookieHeader("SESSION=abc; foo=1")).toBe(
        "SESSION=abc",
      )
    })
  })
})
