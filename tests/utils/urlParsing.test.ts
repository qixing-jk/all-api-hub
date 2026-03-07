import { describe, expect, it } from "vitest"

import {
  normalizeUrlForBasePath,
  normalizeUrlForOriginKey,
  normalizeUrlPathname,
  transformNormalizedUrlPath,
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

  describe("normalizeUrlPathname", () => {
    it("strips trailing slashes and keeps root as /", () => {
      expect(normalizeUrlPathname("/proxy///")).toBe("/proxy")
      expect(normalizeUrlPathname("///")).toBe("/")
      expect(normalizeUrlPathname("")).toBe("/")
    })
  })

  describe("normalizeUrlForBasePath", () => {
    it("normalizes absolute urls without query/hash", () => {
      expect(
        normalizeUrlForBasePath(" https://example.com/proxy/?x=1#hash "),
      ).toBe("https://example.com/proxy")
    })

    it("keeps root absolute urls at origin-only form", () => {
      expect(normalizeUrlForBasePath("https://example.com/?x=1#hash")).toBe(
        "https://example.com",
      )
    })

    it("falls back to trimmed non-url input", () => {
      expect(normalizeUrlForBasePath(" example.com/proxy///?x=1 ")).toBe(
        "example.com/proxy",
      )
    })
  })

  describe("transformNormalizedUrlPath", () => {
    it("transforms valid URL pathnames while preserving origin", () => {
      expect(
        transformNormalizedUrlPath(
          "https://example.com/proxy/v1/messages?beta=true",
          (pathname) => pathname.replace(/\/v1\/messages$/, ""),
        ),
      ).toBe("https://example.com/proxy")
    })

    it("supports transforming root paths", () => {
      expect(
        transformNormalizedUrlPath("https://example.com/?x=1", () => "/v1"),
      ).toBe("https://example.com/v1")
    })

    it("applies the transform to normalized fallback strings", () => {
      expect(
        transformNormalizedUrlPath("example.com/proxy///?x=1", (pathname) => {
          return `${pathname}/v1`
        }),
      ).toBe("example.com/proxy/v1")
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
