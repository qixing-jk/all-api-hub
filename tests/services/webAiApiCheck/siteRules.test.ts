import { describe, expect, it } from "vitest"

import { isWebAiApiCheckPageAllowed } from "~/services/verification/webAiApiCheck/siteAccess"
import {
  WEB_AI_API_CHECK_RULE_LIST,
  WEB_AI_API_CHECK_RULE_SYNTAX,
  WEB_AI_API_CHECK_SITE_ACCESS_MODE,
} from "~/services/verification/webAiApiCheck/siteRuleConstants"
import {
  getWebAiApiCheckSiteDecision,
  normalizeWebAiApiCheckSiteRules,
  resolveWebAiApiCheckSiteRules,
} from "~/services/verification/webAiApiCheck/siteRules"

describe("web API site rules", () => {
  it("explains a single-list match separately from an overlap priority decision", () => {
    const siteRules = {
      priority: WEB_AI_API_CHECK_RULE_LIST.WHITELIST,
      whitelist: [
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
          pattern: "*://example.com/*",
        },
      ],
      blacklist: [
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
          pattern: "*://example.com/private/*",
        },
      ],
    }
    expect(
      getWebAiApiCheckSiteDecision("https://example.com/public", { siteRules }),
    ).toEqual({ allowed: true, reason: "whitelist" })
    expect(
      getWebAiApiCheckSiteDecision("https://example.com/private/key", {
        siteRules,
      }),
    ).toEqual({ allowed: true, reason: "whitelist-priority" })
    expect(
      getWebAiApiCheckSiteDecision("https://example.com/private/key", {
        siteRules: {
          ...siteRules,
          priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
        },
      }),
    ).toEqual({ allowed: false, reason: "blacklist-priority" })
  })
  it("keeps selected local IPv6 sites and explicit ports usable as wildcards", () => {
    const { rules, invalid } = normalizeWebAiApiCheckSiteRules(
      ["*://[::1]:3000/*"],
      WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
    )
    expect(invalid).toEqual([])
    const siteRules = {
      priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
      whitelist: rules,
      blacklist: [],
    }
    expect(
      isWebAiApiCheckPageAllowed("http://[::1]:3000/docs", { siteRules }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("http://[::1]:4000/docs", { siteRules }),
    ).toBe(false)
  })
  it("rejects invalid or unsafe rules and keeps exact query and fragment semantics", () => {
    expect(
      normalizeWebAiApiCheckSiteRules(["[", "(a+)+$"], "regex").invalid,
    ).toEqual(["[", "(a+)+$"])
    expect(
      normalizeWebAiApiCheckSiteRules(
        ["ftp://host.test/", "https://user:password@host.test/"],
        WEB_AI_API_CHECK_RULE_SYNTAX.EXACT,
      ).rules,
    ).toEqual([])
    const { rules } = normalizeWebAiApiCheckSiteRules(
      ["https://example.com/docs?x=1#part"],
      WEB_AI_API_CHECK_RULE_SYNTAX.EXACT,
    )
    const siteRules = {
      priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
      whitelist: rules,
      blacklist: [],
    }
    expect(
      isWebAiApiCheckPageAllowed("https://example.com/docs?x=1#part", {
        siteRules,
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://example.com/docs?x=2#part", {
        siteRules,
      }),
    ).toBe(false)
    expect(isWebAiApiCheckPageAllowed("about:blank", { siteRules })).toBe(false)
  })
  it("preserves old subdomain/path-prefix and regular-expression scopes on first edit", () => {
    for (const config of [
      {
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
          include: ["example.com/api"],
          exclude: ["example.com/api/private"],
        },
      },
      {
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.REGEX,
          include: [],
          exclude: ["example.com/private"],
        },
        urlWhitelist: { patterns: ["^https://example\\.com/"] },
      },
      {
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.ALL,
          include: ["dormant.test"],
          exclude: ["example.com/private"],
        },
      },
    ]) {
      const siteRules = resolveWebAiApiCheckSiteRules(config)
      for (const url of [
        "https://sub.example.com/api/test",
        "https://example.com/api/private/1",
        "https://example.com/private",
        "https://other.test/",
      ]) {
        expect(isWebAiApiCheckPageAllowed(url, { siteRules })).toBe(
          isWebAiApiCheckPageAllowed(url, config),
        )
      }
    }
  })
  it("normalizes and deduplicates bulk wildcard input without widening bare domains", () => {
    const result = normalizeWebAiApiCheckSiteRules(
      [" docs.example.com ", "docs.example.com", "*://*.example.org/*"],
      WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
    )
    expect(result.invalid).toEqual([])
    expect(result.rules).toEqual([
      { syntax: "wildcard", pattern: "*://docs.example.com/*" },
      { syntax: "wildcard", pattern: "*://*.example.org/*" },
    ])
    const siteRules = {
      priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
      whitelist: result.rules,
      blacklist: [],
    }
    expect(
      isWebAiApiCheckPageAllowed("https://sub.docs.example.com/", {
        siteRules,
      }),
    ).toBe(false)
    expect(
      isWebAiApiCheckPageAllowed("https://docs.example.com/a?x=1", {
        siteRules,
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://sub.example.org/", { siteRules }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://evil-example.org/", { siteRules }),
    ).toBe(false)
  })
  it("applies the selected priority only when both lists match", () => {
    const siteRules = {
      priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
      whitelist: [
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
          pattern: "*://*.example.com/*",
        },
      ],
      blacklist: [
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
          pattern: "*://forum.example.com/private/*",
        },
      ],
    }
    const overlap = "https://forum.example.com/private/key"
    expect(isWebAiApiCheckPageAllowed(overlap, { siteRules })).toBe(false)
    expect(
      isWebAiApiCheckPageAllowed(overlap, {
        siteRules: {
          ...siteRules,
          priority: WEB_AI_API_CHECK_RULE_LIST.WHITELIST,
        },
      }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://example.com/public", { siteRules }),
    ).toBe(true)
    expect(
      isWebAiApiCheckPageAllowed("https://elsewhere.test/", { siteRules }),
    ).toBe(false)
  })

  it("preserves an old empty restricted scope as an explicit block-all rule", () => {
    const config = {
      siteAccess: {
        mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE,
        include: [],
        exclude: [],
      },
    }
    const siteRules = resolveWebAiApiCheckSiteRules(config)
    expect(siteRules.blacklist).toEqual([
      { syntax: "wildcard", pattern: "*://*/*" },
    ])
    expect(
      isWebAiApiCheckPageAllowed("https://example.com/", { siteRules }),
    ).toBe(false)
  })
})
