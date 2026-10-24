import { escapeRegExp } from "lodash-es"

import type {
  WebAiApiCheckAutoDetectPreferences,
  WebAiApiCheckSiteRule,
  WebAiApiCheckSiteRules,
} from "~/services/preferences/preferencesSchema"
import {
  WEB_AI_API_CHECK_RULE_LIST,
  type WEB_AI_API_CHECK_RULE_MUTATION,
  WEB_AI_API_CHECK_RULE_SYNTAX,
  WEB_AI_API_CHECK_SITE_ACCESS_MODE,
  WEB_AI_API_CHECK_SITE_DECISION,
} from "~/services/verification/webAiApiCheck/siteRuleConstants"
import { isSafeRegexPattern } from "~/utils/core/regex"

import {
  matchesSitePattern,
  resolveWebAiApiCheckSiteAccess,
  validateSitePatterns,
} from "./legacySiteAccess"

export type WebAiApiCheckRuleList =
  (typeof WEB_AI_API_CHECK_RULE_LIST)[keyof typeof WEB_AI_API_CHECK_RULE_LIST]
export type WebAiApiCheckRuleMutation =
  | {
      type: typeof WEB_AI_API_CHECK_RULE_MUTATION.PRIORITY
      priority: WebAiApiCheckSiteRules["priority"]
    }
  | {
      type: typeof WEB_AI_API_CHECK_RULE_MUTATION.ADD
      list: WebAiApiCheckRuleList
      rules: WebAiApiCheckSiteRule[]
    }
  | {
      type: typeof WEB_AI_API_CHECK_RULE_MUTATION.REMOVE
      list: WebAiApiCheckRuleList
      rule: WebAiApiCheckSiteRule
    }
  | {
      type: typeof WEB_AI_API_CHECK_RULE_MUTATION.EDIT
      list: WebAiApiCheckRuleList
      original: WebAiApiCheckSiteRule
      rule: WebAiApiCheckSiteRule
    }

/** Identify a rule without relying on list positions across concurrent edits. */
export function sameWebAiApiCheckSiteRule(
  a: WebAiApiCheckSiteRule,
  b: WebAiApiCheckSiteRule,
) {
  return a.syntax === b.syntax && a.pattern === b.pattern
}

/** Keep the first occurrence of each syntax/pattern identity, in input order. */
export function uniqueWebAiApiCheckSiteRules(rules: WebAiApiCheckSiteRule[]) {
  return rules.filter(
    (rule, index, array) =>
      array.findIndex((other) => sameWebAiApiCheckSiteRule(other, rule)) ===
      index,
  )
}

/** Validate before admitting new rules; old rules retain their original syntax. */
export function normalizeWebAiApiCheckSiteRules(
  values: string[],
  syntax: WebAiApiCheckSiteRule["syntax"],
) {
  const rules: WebAiApiCheckSiteRule[] = []
  const invalid: string[] = []
  for (const input of values.map((value) => value.trim()).filter(Boolean)) {
    try {
      let pattern = input
      switch (syntax) {
        case WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD: {
          if (/\s/.test(input)) throw new Error("Invalid wildcard")
          const full = /^(https?|\*):\/\//i.test(input) ? input : `*://${input}`
          const parts = full.match(/^(https?|\*):\/\/([^/]+)(\/.*)?$/i)
          if (!parts || /[@?#\\]/.test(parts[2]!))
            throw new Error("Invalid website")
          const host = new URL(
            `http://${parts[2]!.replaceAll("*", "wildcard")}`,
          )
          if (
            !host.hostname.includes(".") &&
            !host.hostname.startsWith("[") &&
            host.hostname !== "localhost" &&
            parts[2] !== "*"
          )
            throw new Error("Invalid domain")
          pattern = `${parts[1]!.toLowerCase()}://${parts[2]!.toLowerCase()}${parts[3] ?? "/*"}`
          break
        }
        case WEB_AI_API_CHECK_RULE_SYNTAX.EXACT: {
          const url = new URL(input)
          if (!/^https?:$/.test(url.protocol) || url.username || url.password)
            throw new Error("Invalid HTTP URL")
          pattern = url.href
          break
        }
        case WEB_AI_API_CHECK_RULE_SYNTAX.REGEX:
          if (!isSafeRegexPattern(input, "i")) throw new Error("Invalid regex")
          break
        case WEB_AI_API_CHECK_RULE_SYNTAX.LEGACY:
          if (validateSitePatterns([input]).invalid.length)
            throw new Error("Invalid legacy rule")
          break
        default:
          throw new Error("Unknown syntax")
      }
      const rule = { syntax, pattern }
      if (!rules.some((existing) => sameWebAiApiCheckSiteRule(existing, rule)))
        rules.push(rule)
    } catch {
      invalid.push(input)
    }
  }
  return { rules, invalid }
}

/** Resolve typed rules while retaining the effective legacy scope. */
export function resolveWebAiApiCheckSiteRules(
  config: Partial<WebAiApiCheckAutoDetectPreferences>,
): WebAiApiCheckSiteRules {
  if (config.siteRules) return config.siteRules
  const access = resolveWebAiApiCheckSiteAccess(config)
  const whitelist: WebAiApiCheckSiteRule[] =
    access.mode === WEB_AI_API_CHECK_SITE_ACCESS_MODE.ALL
      ? []
      : access.mode === WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE
        ? access.include.map((pattern) => ({
            syntax: WEB_AI_API_CHECK_RULE_SYNTAX.LEGACY,
            pattern,
          }))
        : (config.urlWhitelist?.patterns ?? [])
            .filter((pattern) => pattern.trim())
            .map((pattern) => ({
              syntax: WEB_AI_API_CHECK_RULE_SYNTAX.REGEX,
              pattern,
            }))
  const blacklist: WebAiApiCheckSiteRule[] = access.exclude.map((pattern) => ({
    syntax: WEB_AI_API_CHECK_RULE_SYNTAX.LEGACY,
    pattern,
  }))
  if (
    access.mode !== WEB_AI_API_CHECK_SITE_ACCESS_MODE.ALL &&
    !whitelist.length
  )
    blacklist.push({
      syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
      pattern: "*://*/*",
    })
  return {
    priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
    whitelist,
    blacklist,
  }
}

/** Compile host globs separately so a wildcard cannot cross a domain boundary. */
function wildcardMatches(pattern: string, url: URL): boolean {
  const parts = pattern.match(/^(https?|\*):\/\/([^/]+)(\/.*)$/i)
  if (!parts) return false
  const [, scheme, authority, path] = parts
  if (scheme !== "*" && url.protocol !== `${scheme!.toLowerCase()}:`)
    return false
  const hostPort = authority!.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/)
  if (!hostPort) return false
  const [, host, port] = hostPort
  if (port && (url.port || (url.protocol === "https:" ? "443" : "80")) !== port)
    return false
  const glob = (value: string, star: string) =>
    value.split("*").map(escapeRegExp).join(star)
  const hostname =
    host === "*"
      ? ".*"
      : host!.startsWith("*.")
        ? `(?:[^./:]+\\.)*${glob(host!.slice(2), "[^./:]*")}`
        : glob(host!, "[^./:]*")
  return (
    new RegExp(`^${hostname}$`, "i").test(url.hostname) &&
    new RegExp(`^${glob(path!, ".*")}$`).test(
      url.pathname + url.search + url.hash,
    )
  )
}

/** Match one typed rule while keeping legacy semantics explicit. */
function matchesWebAiApiCheckSiteRule(
  pageUrl: string,
  rule: WebAiApiCheckSiteRule,
): boolean {
  try {
    const url = new URL(pageUrl)
    if (!/^https?:$/.test(url.protocol)) return false
    switch (rule.syntax) {
      case WEB_AI_API_CHECK_RULE_SYNTAX.LEGACY:
        return matchesSitePattern(pageUrl, rule.pattern)
      case WEB_AI_API_CHECK_RULE_SYNTAX.REGEX:
        return new RegExp(rule.pattern, "i").test(pageUrl)
      case WEB_AI_API_CHECK_RULE_SYNTAX.EXACT:
        return url.href === new URL(rule.pattern).href
      case WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD:
        return wildcardMatches(rule.pattern, url)
      default:
        return false
    }
  } catch {
    return false
  }
}

/** Resolve overlap and unmatched-page behavior once for all extension contexts. */
export function getWebAiApiCheckSiteDecision(
  pageUrl: string,
  config: Partial<WebAiApiCheckAutoDetectPreferences>,
) {
  try {
    if (!/^https?:$/.test(new URL(pageUrl).protocol))
      return {
        allowed: false,
        reason: WEB_AI_API_CHECK_SITE_DECISION.UNSUPPORTED,
      }
  } catch {
    return {
      allowed: false,
      reason: WEB_AI_API_CHECK_SITE_DECISION.UNSUPPORTED,
    }
  }
  const rules = resolveWebAiApiCheckSiteRules(config)
  const white = rules.whitelist.some((rule) =>
    matchesWebAiApiCheckSiteRule(pageUrl, rule),
  )
  const black = rules.blacklist.some((rule) =>
    matchesWebAiApiCheckSiteRule(pageUrl, rule),
  )
  if (white && black)
    return {
      allowed: rules.priority === WEB_AI_API_CHECK_RULE_LIST.WHITELIST,
      reason:
        rules.priority === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
          ? WEB_AI_API_CHECK_SITE_DECISION.WHITELIST_PRIORITY
          : WEB_AI_API_CHECK_SITE_DECISION.BLACKLIST_PRIORITY,
    }
  if (white)
    return { allowed: true, reason: WEB_AI_API_CHECK_SITE_DECISION.WHITELIST }
  if (black)
    return { allowed: false, reason: WEB_AI_API_CHECK_SITE_DECISION.BLACKLIST }
  return {
    allowed: rules.whitelist.length === 0,
    reason: rules.whitelist.length
      ? WEB_AI_API_CHECK_SITE_DECISION.UNLISTED
      : WEB_AI_API_CHECK_SITE_DECISION.DEFAULT,
  }
}
