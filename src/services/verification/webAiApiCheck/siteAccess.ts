import type {
  WebAiApiCheckAutoDetectPreferences,
  WebAiApiCheckSiteAccessPreferences,
} from "~/services/preferences/preferencesSchema"
import { WEB_AI_API_CHECK_SITE_ACCESS_MODE } from "~/services/verification/webAiApiCheck/siteRuleConstants"

import { resolveWebAiApiCheckSiteAccess } from "./legacySiteAccess"
import { getWebAiApiCheckSiteDecision } from "./siteRules"

export {
  resolveWebAiApiCheckSiteAccess,
  matchesSitePattern,
  validateSitePatterns,
} from "./legacySiteAccess"

/** Apply the same website policy in content, background and settings previews. */
export function isWebAiApiCheckPageAllowed(
  pageUrl: string,
  config: Partial<WebAiApiCheckAutoDetectPreferences>,
): boolean {
  return getWebAiApiCheckSiteDecision(pageUrl, config).allowed
}

/** Settings-facing description of the scope, so the UI never guesses. */
export interface WebAiApiCheckSiteAccessSummary {
  mode: WebAiApiCheckSiteAccessPreferences["mode"]
  includeCount: number
  excludeCount: number
  patternCount: number
  /** True when the configured scope cannot match any page. */
  matchesNothing: boolean
}

/**
 * Summarize which websites auto-detection currently participates in.
 *
 * Mirrors {@link isWebAiApiCheckPageAllowed} so the settings copy stays truthful
 * when a limited scope was configured without any rule.
 */
export function summarizeWebAiApiCheckSiteAccess(
  config: Partial<WebAiApiCheckAutoDetectPreferences>,
): WebAiApiCheckSiteAccessSummary {
  const access = resolveWebAiApiCheckSiteAccess(config)
  const patternCount = (config.urlWhitelist?.patterns ?? []).filter((pattern) =>
    pattern.trim(),
  ).length
  return {
    mode: access.mode,
    includeCount: access.include.length,
    excludeCount: access.exclude.length,
    patternCount,
    matchesNothing:
      (access.mode === WEB_AI_API_CHECK_SITE_ACCESS_MODE.INCLUDE &&
        access.include.length === 0) ||
      (access.mode === WEB_AI_API_CHECK_SITE_ACCESS_MODE.REGEX &&
        patternCount === 0),
  }
}
