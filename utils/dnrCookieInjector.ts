import {
  COOKIE_AUTH_HEADER_NAME,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
  EXTENSION_HEADER_NAME,
} from "~/utils/cookieHelper"

/**
 * DeclarativeNetRequest session-rule helpers.
 *
 * Chromium-based browsers can modify request headers using declarativeNetRequest.
 * We use a short-lived, per-tab session rule during temp-window fetch so that:
 * - token-auth requests can carry WAF-bypass cookies without leaking session cookies
 * - requests are isolated to the temp window tab (fixes multi-account confusion)
 */

export const TEMP_WINDOW_DNR_RULE_ID_BASE = 1_000_000 as const

export interface TempWindowCookieRuleParams {
  tabId: number
  url: string
  cookieHeader: string
}

/**
 * Checks whether the declarativeNetRequest session rules API is available.
 */
function hasDnrApi(): boolean {
  try {
    return Boolean(
      (globalThis as any).chrome?.declarativeNetRequest?.updateSessionRules,
    )
  } catch {
    return false
  }
}

/**
 * Builds a stable rule ID for a given tab.
 */
function buildRuleId(tabId: number): number {
  const safeTabId = Number.isFinite(tabId) ? Math.max(0, Math.floor(tabId)) : 0
  return TEMP_WINDOW_DNR_RULE_ID_BASE + safeTabId
}

/**
 * Build a session-scoped DNR rule that forces the Cookie header for a specific
 * tab and URL.
 */
export function buildTempWindowCookieRule(params: TempWindowCookieRuleParams) {
  const ruleId = buildRuleId(params.tabId)

  return {
    id: ruleId,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: EXTENSION_HEADER_NAME, operation: "remove" },
        { header: COOKIE_AUTH_HEADER_NAME, operation: "remove" },
        { header: COOKIE_SESSION_OVERRIDE_HEADER_NAME, operation: "remove" },
        { header: "Cookie", operation: "set", value: params.cookieHeader },
      ],
    },
    condition: {
      tabIds: [params.tabId],
      urlFilter: `||${new URL(params.url).hostname}/`,
      isUrlFilterCaseSensitive: true,
      resourceTypes: ["xmlhttprequest"],
    },
  } as const
}

/**
 * Installs (or replaces) a temp-window Cookie override rule for the given tab.
 * Returns the installed ruleId, or null when rule install is not possible.
 */
export async function applyTempWindowCookieRule(
  params: TempWindowCookieRuleParams,
): Promise<number | null> {
  if (!params.cookieHeader) {
    return null
  }

  if (!hasDnrApi()) {
    return null
  }

  const ruleId = buildRuleId(params.tabId)
  const rule = buildTempWindowCookieRule(params)

  try {
    await (globalThis as any).chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [rule],
    })
    return ruleId
  } catch (error) {
    console.warn("[DNR] Failed to install temp-window cookie rule", error)
    return null
  }
}

/**
 * Best-effort removal of a previously installed temp-window cookie rule.
 */
export async function removeTempWindowCookieRule(
  ruleId: number,
): Promise<void> {
  if (!hasDnrApi()) {
    return
  }

  try {
    await (globalThis as any).chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
    })
  } catch (error) {
    console.warn("[DNR] Failed to remove temp-window cookie rule", error)
  }
}
