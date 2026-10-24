import { escapeRegExp } from "lodash-es"

import type {
  WebAiApiCheckAutoDetectPreferences,
  WebAiApiCheckSiteAccessPreferences,
} from "~/services/preferences/preferencesSchema"
import { WEB_AI_API_CHECK_SITE_ACCESS_MODE } from "~/services/verification/webAiApiCheck/siteRuleConstants"

/** Resolve old regexp lists without overriding a user's configured scope. */
export function resolveWebAiApiCheckSiteAccess(
  config: Partial<WebAiApiCheckAutoDetectPreferences>,
): WebAiApiCheckSiteAccessPreferences {
  return (
    config.siteAccess ?? {
      mode: config.urlWhitelist?.patterns?.some(
        (pattern) => pattern.trim() && pattern !== "^https?://",
      )
        ? WEB_AI_API_CHECK_SITE_ACCESS_MODE.REGEX
        : WEB_AI_API_CHECK_SITE_ACCESS_MODE.ALL,
      include: [],
      exclude: [],
    }
  )
}

/** Compile a domain or HTTP URL prefix, with optional wildcard characters. */
function compileSitePattern(value: string): ((url: URL) => boolean) | null {
  const input = value.trim()
  if (!input || /[\s@\\[\]{}^$|()+]/.test(input)) return null
  const hasScheme = /^https?:\/\//i.test(input)
  if (!hasScheme && input.includes(":")) return null
  try {
    const parsed = new URL(hasScheme ? input : `https://${input}`)
    if (
      !/^https?:$/.test(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return null
    if (
      !parsed.hostname ||
      parsed.hostname === "*" ||
      (!parsed.hostname.includes(".") && parsed.hostname !== "localhost")
    )
      return null
    // A leading `*.` is redundant: naming a website already covers subdomains.
    const labels = parsed.hostname.split(".")
    if (labels[0] === "*") labels.shift()
    if (labels.length === 0) return null
    const hostPattern = new RegExp(
      `^(?:[^.:/]+\\.)*${labels
        .map((label) => label.split("*").map(escapeRegExp).join("[^.:/]+"))
        .join("\\.")}$`,
      "i",
    )
    const port = parsed.port
    const path = parsed.pathname.replace(/\/+$/, "")
    const pathPattern = path
      ? new RegExp(
          `^${escapeRegExp(path).replace(/\\\*/g, ".*")}${path.endsWith("*") ? "" : "(?:/|$)"}`,
        )
      : null
    return (url) =>
      (!hasScheme || url.protocol === parsed.protocol) &&
      hostPattern.test(url.hostname) &&
      (!port || url.port === port) &&
      (!pathPattern || pathPattern.test(url.pathname))
  } catch {
    return null
  }
}

/** Normalize friendly entries and report invalid lines before persisting them. */
export function validateSitePatterns(values: string[]) {
  const patterns = [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ]
  return {
    patterns,
    invalid: patterns.filter((value) => !compileSitePattern(value)),
  }
}

/** Match a single friendly rule without exposing regexp syntax to the user. */
export function matchesSitePattern(url: string, pattern: string): boolean {
  try {
    return compileSitePattern(pattern)?.(new URL(url)) ?? false
  } catch {
    return false
  }
}
