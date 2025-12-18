import { describe, expect, it } from "vitest"

import {
  buildOriginWhitelistPattern,
  buildUrlPrefixWhitelistPattern,
  isUrlAllowedByRegexList,
} from "~/utils/redemptionAssistWhitelist"

describe("redemptionAssistWhitelist", () => {
  describe("buildOriginWhitelistPattern", () => {
    it("creates a pattern that matches any URL under the same origin", () => {
      const pattern = buildOriginWhitelistPattern("https://example.com/abc")
      expect(pattern).toBeTruthy()

      expect(isUrlAllowedByRegexList("https://example.com/", [pattern!])).toBe(
        true,
      )
      expect(
        isUrlAllowedByRegexList("https://example.com/console/topup", [
          pattern!,
        ]),
      ).toBe(true)
      expect(isUrlAllowedByRegexList("https://other.com/", [pattern!])).toBe(
        false,
      )
    })

    it("returns null for invalid urls", () => {
      expect(buildOriginWhitelistPattern("not-a-url")).toBeNull()
    })
  })

  describe("buildUrlPrefixWhitelistPattern", () => {
    it("creates a pattern that matches the same origin+path and allows query/hash", () => {
      const pattern = buildUrlPrefixWhitelistPattern(
        "https://example.com/console/topup?x=1#hash",
      )
      expect(pattern).toBeTruthy()

      expect(
        isUrlAllowedByRegexList("https://example.com/console/topup", [
          pattern!,
        ]),
      ).toBe(true)
      expect(
        isUrlAllowedByRegexList("https://example.com/console/topup/?a=b", [
          pattern!,
        ]),
      ).toBe(true)
      expect(
        isUrlAllowedByRegexList("https://example.com/console/log", [pattern!]),
      ).toBe(false)
    })

    it("returns null for invalid urls", () => {
      expect(buildUrlPrefixWhitelistPattern("/relative/path")).toBeNull()
    })
  })

  describe("isUrlAllowedByRegexList", () => {
    it("ignores invalid patterns", () => {
      expect(
        isUrlAllowedByRegexList("https://example.com", [
          "(",
          "^https://example\\.com$",
        ]),
      ).toBe(true)
    })

    it("returns false when url is empty", () => {
      expect(isUrlAllowedByRegexList("", [".*"])).toBe(false)
    })
  })
})
