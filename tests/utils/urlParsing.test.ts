import { describe, expect, it } from "vitest"

import {
  normalizeUrlForOriginKey,
  tryParseOrigin,
  tryParseUrlPrefix,
} from "~/utils/core/urlParsing"

describe("urlParsing", () => {
  describe("tryParseOrigin", () => {
    it("returns origin for absolute URLs", () => {
      expect(tryParseOrigin("https://Example.com/path?x=1#hash")).toBe(
        "https://example.com",
      )
    })

    it("returns null for invalid URLs", () => {
      expect(tryParseOrigin("not a url")).toBeNull()
    })
  })

  describe("tryParseUrlPrefix", () => {
    it("strips query/hash by returning origin+pathname", () => {
      expect(
        tryParseUrlPrefix("https://example.com/console/topup?x=1#hash"),
      ).toBe("https://example.com/console/topup")
    })
  })

  describe("normalizeUrlForOriginKey", () => {
    it("returns empty string for empty input", () => {
      expect(normalizeUrlForOriginKey("")).toBe("")
      expect(normalizeUrlForOriginKey("   ")).toBe("")
    })

    it("returns origin for valid URLs", () => {
      expect(
        normalizeUrlForOriginKey("https://example.com/console/topup?x=1"),
      ).toBe("https://example.com")
    })

    it("falls back to trimmed input when not a URL", () => {
      expect(normalizeUrlForOriginKey(" example.com/// ")).toBe("example.com")
    })

    it("supports lowercasing keys", () => {
      expect(
        normalizeUrlForOriginKey(" HTTPS://Example.com/ ", { lowerCase: true }),
      ).toBe("https://example.com")
    })
  })
})
