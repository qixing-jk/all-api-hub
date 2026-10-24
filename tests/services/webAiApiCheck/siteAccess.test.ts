import { describe, expect, it } from "vitest"

import {
  isWebAiApiCheckPageAllowed,
  matchesSitePattern,
  summarizeWebAiApiCheckSiteAccess,
  validateSitePatterns,
} from "~/services/verification/webAiApiCheck/siteAccess"
import { WEB_AI_API_CHECK_SITE_ACCESS_MODE } from "~/services/verification/webAiApiCheck/siteRuleConstants"

describe("web API detection site access", () => {
  it("rejects query-bearing, fragment-bearing, wildcard-only and invalid URL legacy patterns", () => {
    expect(
      validateSitePatterns([
        "https://example.com/?q=1",
        "https://example.com/#key",
        "*",
        "https://[invalid",
        "https://%.com",
      ]).invalid,
    ).toEqual([
      "https://example.com/?q=1",
      "https://example.com/#key",
      "*",
      "https://[invalid",
      "https://%.com",
    ])
    expect(matchesSitePattern("not a URL", "example.com")).toBe(false)
  })
  it("accepts imported legacy settings with a missing patterns array", () => {
    expect(
      isWebAiApiCheckPageAllowed("https://example.com/", {
        urlWhitelist: {} as { patterns: string[] },
      }),
    ).toBe(true)
  })
  it("allows HTTP pages by default and rejects other schemes", () => {
    expect(isWebAiApiCheckPageAllowed("https://linux.do/t/topic/123", {})).toBe(
      true,
    )
    expect(isWebAiApiCheckPageAllowed("file:///tmp/post", {})).toBe(false)
  })
  it("limits detection using domains, URL prefixes and wildcard subdomains", () => {
    const siteAccess = {
      mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
      include: ["linux.do", "https://example.com/api", "*.gateway.test"],
      exclude: [],
    }
    expect(
      isWebAiApiCheckPageAllowed("https://linux.do/t/123", { siteAccess }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://example.com/api/models", {
        siteAccess,
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://example.com/apikey", { siteAccess }),
    ).toBe(false)
    expect(
      isWebAiApiCheckPageAllowed("https://one.gateway.test/p", { siteAccess }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://one.two.gateway.test/p", {
        siteAccess,
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://evil-linux.do/p", { siteAccess }),
    ).toBe(false)
  })
  it("gives exclusions priority over included sites and supports page paths", () => {
    const siteAccess = {
      mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
      include: ["linux.do"],
      exclude: ["https://linux.do/private"],
    }
    expect(
      isWebAiApiCheckPageAllowed("https://linux.do/private/1", { siteAccess }),
    ).toBe(false)
    expect(
      isWebAiApiCheckPageAllowed("https://linux.do/public", { siteAccess }),
    ).toBe(true)
  })
  it("preserves legacy regular expressions and fails closed on an empty include list", () => {
    expect(
      isWebAiApiCheckPageAllowed("https://linux.do/t/1", {
        urlWhitelist: { patterns: ["^https://linux\\.do/"] },
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://other.test", {
        urlWhitelist: { patterns: ["^https://linux\\.do/"] },
      }),
    ).toBe(false)
    expect(
      isWebAiApiCheckPageAllowed("https://linux.do", {
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
          include: [],
          exclude: [],
        },
      }),
    ).toBe(false)
  })
  it("rejects invalid entries instead of treating them as regular expressions", () => {
    expect(
      validateSitePatterns([
        "linux.do",
        "https://example.com/p",
        "*.example.com",
      ]).invalid,
    ).toEqual([])
    expect(
      validateSitePatterns([
        "[",
        "javascript:alert(1)",
        "example.com@evil.test",
      ]).invalid,
    ).toHaveLength(3)
  })
  it("applies one website rule to its subdomains in both directions", () => {
    const included = {
      mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
      include: ["gateway.test"],
      exclude: [],
    }
    expect(
      isWebAiApiCheckPageAllowed("https://gateway.test/p", {
        siteAccess: included,
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://one.gateway.test/p", {
        siteAccess: included,
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://notgateway.test/p", {
        siteAccess: included,
      }),
    ).toBe(false)
    expect(
      isWebAiApiCheckPageAllowed("https://one.two.gateway.test/p", {
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
          include: ["*.gateway.test"],
          exclude: [],
        },
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://gateway.test/p", {
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
          include: ["*.gateway.test"],
          exclude: [],
        },
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://one.linux.do/p", {
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.ALL,
          include: [],
          exclude: ["linux.do"],
        },
      }),
    ).toBe(false)
  })
  it("keeps partial-label wildcards working for rules that already used them", () => {
    const siteAccess = {
      mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
      include: ["api*.gw.test"],
      exclude: [],
    }
    expect(
      isWebAiApiCheckPageAllowed("https://api1.gw.test/p", { siteAccess }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://api.evil.gw.test/p", { siteAccess }),
    ).toBe(false)
    expect(
      isWebAiApiCheckPageAllowed("https://console.gw.test/p", { siteAccess }),
    ).toBe(false)
    expect(validateSitePatterns(["api*.gw.test"]).invalid).toEqual([])
  })
  it("ignores the page port unless the rule names one", () => {
    const include = (pattern: string) => ({
      mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
      include: [pattern],
      exclude: [],
    })
    expect(
      isWebAiApiCheckPageAllowed("https://gateway.test:8443/p", {
        siteAccess: include("https://gateway.test"),
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://gateway.test:8443/p", {
        siteAccess: include("https://gateway.test:9000"),
      }),
    ).toBe(false)
    expect(
      isWebAiApiCheckPageAllowed("https://gateway.test:8443/p", {
        siteAccess: include("https://gateway.test:8443"),
      }),
    ).toBe(true)
  })
})

describe("web API detection site access summary", () => {
  it("reports the scope the settings page needs to describe", () => {
    expect(summarizeWebAiApiCheckSiteAccess({})).toEqual({
      mode: "all",
      includeCount: 0,
      excludeCount: 0,
      patternCount: 0,
      matchesNothing: false,
    })
  })
  it("flags a limited scope that cannot match any page", () => {
    expect(
      summarizeWebAiApiCheckSiteAccess({
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
          include: [],
          exclude: ["a.test"],
        },
      }),
    ).toMatchObject({
      mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
      includeCount: 0,
      excludeCount: 1,
      matchesNothing: true,
    })
  })
  it("counts legacy regular expressions when that mode is active", () => {
    expect(
      summarizeWebAiApiCheckSiteAccess({
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.REGEX,
          include: [],
          exclude: [],
        },
        urlWhitelist: { patterns: ["^https://a/", " ^https://b/ ", ""] },
      }),
    ).toMatchObject({ mode: "regex", patternCount: 2, matchesNothing: false })
  })
})
